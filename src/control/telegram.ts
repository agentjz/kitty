import crypto from "node:crypto";
import type { ControlDatabase } from "./sqlite.js";
import { TurnLedgerRepo } from "./turns.js";

export interface ServiceLeaseRecord {
  name: string;
  ownerToken: string;
  generation: number;
  processId: number;
  leaseExpiresAt: string;
}

export type TelegramInboxStatus = "received" | "processing" | "completed" | "failed";

export interface TelegramOutboxRecord {
  id: string;
  chatId: number;
  kind: "text" | "file";
  payload: Record<string, unknown>;
  status: "queued" | "sending" | "sent" | "uncertain";
  deliveryToken?: string;
  remoteMessageId?: number;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class ServiceLeaseLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  acquire(input: { name: string; processId: number; processIdentity?: Record<string, unknown>; leaseMs?: number }): ServiceLeaseRecord {
    return this.db.transaction(() => {
      const now = new Date();
      const nowIso = now.toISOString();
      const current = this.db.prepare("SELECT * FROM service_leases WHERE name=?").get(input.name) as {
        owner_token: string; generation: number; lease_expires_at: string;
      } | undefined;
      if (current?.lease_expires_at && current.lease_expires_at > nowIso) {
        throw new Error(`Service ${input.name} already has an active owner generation ${current.generation}.`);
      }
      const ownerToken = crypto.randomUUID();
      const generation = (current?.generation ?? 0) + 1;
      const leaseExpiresAt = new Date(now.getTime() + (input.leaseMs ?? 30_000)).toISOString();
      this.db.prepare(`
        INSERT INTO service_leases (
          name, owner_token, generation, process_id, process_identity_json,
          lease_expires_at, heartbeat_at, updated_at
        ) VALUES (@name, @ownerToken, @generation, @processId, @processIdentityJson, @leaseExpiresAt, @now, @now)
        ON CONFLICT(name) DO UPDATE SET
          owner_token=excluded.owner_token, generation=excluded.generation,
          process_id=excluded.process_id, process_identity_json=excluded.process_identity_json,
          lease_expires_at=excluded.lease_expires_at, heartbeat_at=excluded.heartbeat_at,
          updated_at=excluded.updated_at
        WHERE service_leases.lease_expires_at <= @now
      `).run({
        name: input.name,
        processId: input.processId,
        ownerToken,
        generation,
        processIdentityJson: input.processIdentity ? JSON.stringify(input.processIdentity) : null,
        leaseExpiresAt,
        now: nowIso,
      });
      const row = this.load(input.name);
      if (!row || row.ownerToken !== ownerToken) throw new Error(`Service ${input.name} ownership changed during acquire.`);
      return row;
    })();
  }

  heartbeat(lease: ServiceLeaseRecord, leaseMs = 30_000): ServiceLeaseRecord {
    const now = new Date();
    const result = this.db.prepare(`
      UPDATE service_leases SET heartbeat_at=@now, lease_expires_at=@expires, updated_at=@now
      WHERE name=@name AND owner_token=@ownerToken AND generation=@generation AND lease_expires_at > @now
    `).run({
      name: lease.name,
      ownerToken: lease.ownerToken,
      generation: lease.generation,
      now: now.toISOString(),
      expires: new Date(now.getTime() + leaseMs).toISOString(),
    });
    if (result.changes !== 1) throw new Error(`Service ${lease.name} lost ownership.`);
    return this.load(lease.name)!;
  }

  release(lease: ServiceLeaseRecord): void {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE service_leases SET lease_expires_at=@now, updated_at=@now
      WHERE name=@name AND owner_token=@ownerToken AND generation=@generation
    `).run({
      name: lease.name,
      ownerToken: lease.ownerToken,
      generation: lease.generation,
      now,
    });
  }

  load(name: string): ServiceLeaseRecord | undefined {
    const row = this.db.prepare("SELECT * FROM service_leases WHERE name=?").get(name) as {
      name: string; owner_token: string; generation: number; process_id: number; lease_expires_at: string;
    } | undefined;
    return row ? {
      name: row.name,
      ownerToken: row.owner_token,
      generation: row.generation,
      processId: row.process_id,
      leaseExpiresAt: row.lease_expires_at,
    } : undefined;
  }
}

export class TelegramLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  claimInbox(updateId: number, peerKey?: string): boolean {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT OR IGNORE INTO telegram_inbox (update_id, status, peer_key, created_at, updated_at)
        VALUES (?, 'received', ?, ?, ?)
      `).run(updateId, peerKey ?? null, now, now);
      const row = this.db.prepare("SELECT status FROM telegram_inbox WHERE update_id=?").get(updateId) as { status: string };
      if (row.status === "completed") return false;
      this.db.prepare(`UPDATE telegram_inbox SET status='processing', peer_key=COALESCE(peer_key, ?), updated_at=? WHERE update_id=?`).run(peerKey ?? null, now, updateId);
      return true;
    })();
  }

  bindTurn(input: { updateId: number; sessionId: string; text: string }): string {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT turn_id FROM telegram_inbox WHERE update_id=?").get(input.updateId) as { turn_id: string | null } | undefined;
      if (!row) throw new Error(`Unknown Telegram update ${input.updateId}.`);
      if (row.turn_id) return row.turn_id;
      const turn = new TurnLedgerRepo(this.db).admit({ sessionId: input.sessionId, input: input.text, inputSource: "external" });
      this.db.prepare("UPDATE telegram_inbox SET turn_id=?, updated_at=? WHERE update_id=? AND turn_id IS NULL")
        .run(turn.id, new Date().toISOString(), input.updateId);
      return turn.id;
    })();
  }

  markInbox(updateId: number, status: TelegramInboxStatus, input: { turnId?: string; error?: string } = {}): void {
    const result = this.db.prepare(`
      UPDATE telegram_inbox SET status=@status, turn_id=COALESCE(@turnId, turn_id),
        error=@error, updated_at=@now WHERE update_id=@updateId
    `).run({ updateId, status, turnId: input.turnId ?? null, error: input.error ?? null, now: new Date().toISOString() });
    if (result.changes !== 1) throw new Error(`Unknown Telegram update ${updateId}.`);
  }

  enqueue(input: { chatId: number; kind: "text" | "file"; payload: Record<string, unknown> }): TelegramOutboxRecord {
    const now = new Date().toISOString();
    const record: TelegramOutboxRecord = {
      id: `telegram-out-${crypto.randomUUID()}`,
      chatId: input.chatId,
      kind: input.kind,
      payload: input.payload,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      INSERT INTO telegram_outbox (id, chat_id, kind, payload_json, status, created_at, updated_at)
      VALUES (@id, @chatId, @kind, @payloadJson, @status, @createdAt, @updatedAt)
    `).run({
      id: record.id,
      chatId: record.chatId,
      kind: record.kind,
      payloadJson: JSON.stringify(record.payload),
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    return record;
  }

  claimNext(): TelegramOutboxRecord | undefined {
    return this.db.transaction(() => {
      const row = this.db.prepare(`SELECT id FROM telegram_outbox WHERE status='queued' ORDER BY created_at LIMIT 1`).get() as { id: string } | undefined;
      if (!row) return undefined;
      const token = crypto.randomUUID();
      const now = new Date().toISOString();
      const changed = this.db.prepare(`
        UPDATE telegram_outbox SET status='sending', delivery_token=?, updated_at=? WHERE id=? AND status='queued'
      `).run(token, now, row.id).changes;
      return changed === 1 ? this.loadOutbox(row.id) : undefined;
    })();
  }

  settleOutbox(id: string, deliveryToken: string, input: { status: "sent" | "uncertain"; remoteMessageId?: number; error?: string }): TelegramOutboxRecord {
    const result = this.db.prepare(`
      UPDATE telegram_outbox SET status=@status, remote_message_id=@remoteMessageId,
        error=@error, updated_at=@now
      WHERE id=@id AND status='sending' AND delivery_token=@deliveryToken
    `).run({
      id,
      deliveryToken,
      status: input.status,
      remoteMessageId: input.remoteMessageId ?? null,
      error: input.error ?? null,
      now: new Date().toISOString(),
    });
    if (result.changes !== 1) throw new Error(`Telegram outbox ${id} lost its delivery claim.`);
    return this.loadOutbox(id)!;
  }

  recoverSending(): number {
    return this.db.prepare(`
      UPDATE telegram_outbox SET status='uncertain', error=COALESCE(error, 'Delivery owner stopped before acknowledgement.'),
        updated_at=? WHERE status='sending'
    `).run(new Date().toISOString()).changes;
  }

  listOutbox(statuses?: readonly TelegramOutboxRecord["status"][]): TelegramOutboxRecord[] {
    const rows = this.db.prepare("SELECT * FROM telegram_outbox ORDER BY created_at").all() as TelegramOutboxRow[];
    const filter = new Set(statuses ?? []);
    return rows.map(fromOutboxRow).filter((row) => filter.size === 0 || filter.has(row.status));
  }

  private loadOutbox(id: string): TelegramOutboxRecord | undefined {
    const row = this.db.prepare("SELECT * FROM telegram_outbox WHERE id=?").get(id) as TelegramOutboxRow | undefined;
    return row ? fromOutboxRow(row) : undefined;
  }
}

interface TelegramOutboxRow {
  id: string; chat_id: number; kind: string; payload_json: string; status: string;
  delivery_token: string | null; remote_message_id: number | null; error: string | null;
  created_at: string; updated_at: string;
}

function fromOutboxRow(row: TelegramOutboxRow): TelegramOutboxRecord {
  return {
    id: row.id,
    chatId: row.chat_id,
    kind: row.kind as "text" | "file",
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    status: row.status as TelegramOutboxRecord["status"],
    deliveryToken: row.delivery_token ?? undefined,
    remoteMessageId: row.remote_message_id ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
