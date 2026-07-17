import crypto from "node:crypto";

import type { ControlDatabase } from "./sqlite.js";
import { TurnLedgerRepo } from "./turns.js";

export type RemoteInboxStatus = "received" | "processing" | "completed" | "failed";
export type RemoteOutboxStatus = "queued" | "sending" | "sent" | "uncertain";

export interface RemoteOutboxRecord {
  id: string;
  host: string;
  recipientKey: string;
  kind: "text" | "file";
  payload: Record<string, unknown>;
  status: RemoteOutboxStatus;
  deliveryToken?: string;
  remoteMessageId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
}

export class RemoteMessageLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  claimInbox(input: { host: string; messageId: string; peerKey?: string }): boolean {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      this.db.prepare(`
        INSERT OR IGNORE INTO remote_inbox (host, message_id, status, peer_key, created_at, updated_at)
        VALUES (?, ?, 'received', ?, ?, ?)
      `).run(input.host, input.messageId, input.peerKey ?? null, now, now);
      const row = this.db.prepare("SELECT status FROM remote_inbox WHERE host=? AND message_id=?")
        .get(input.host, input.messageId) as { status: string };
      if (row.status === "completed" || row.status === "failed") return false;
      this.db.prepare(`
        UPDATE remote_inbox SET status='processing', peer_key=COALESCE(peer_key, ?), updated_at=?
        WHERE host=? AND message_id=?
      `).run(input.peerKey ?? null, now, input.host, input.messageId);
      return true;
    })();
  }

  bindTurn(input: { host: string; messageId: string; sessionId: string; text: string }): string {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT turn_id FROM remote_inbox WHERE host=? AND message_id=?")
        .get(input.host, input.messageId) as { turn_id: string | null } | undefined;
      if (!row) throw new Error(`Unknown ${input.host} message ${input.messageId}.`);
      if (row.turn_id) return row.turn_id;
      const turn = new TurnLedgerRepo(this.db).admit({
        sessionId: input.sessionId,
        input: input.text,
        inputSource: "external",
      });
      this.db.prepare(`
        UPDATE remote_inbox SET turn_id=?, updated_at=?
        WHERE host=? AND message_id=? AND turn_id IS NULL
      `).run(turn.id, new Date().toISOString(), input.host, input.messageId);
      return turn.id;
    })();
  }

  markInbox(input: { host: string; messageId: string; status: RemoteInboxStatus; error?: string }): void {
    const result = this.db.prepare(`
      UPDATE remote_inbox SET status=@status, error=@error, updated_at=@now
      WHERE host=@host AND message_id=@messageId
    `).run({ ...input, error: input.error ?? null, now: new Date().toISOString() });
    if (result.changes !== 1) throw new Error(`Unknown ${input.host} message ${input.messageId}.`);
  }

  enqueue(input: {
    host: string;
    recipientKey: string;
    kind: "text" | "file";
    payload: Record<string, unknown>;
  }): RemoteOutboxRecord {
    const now = new Date().toISOString();
    const record: RemoteOutboxRecord = {
      id: `remote-out-${crypto.randomUUID()}`,
      ...input,
      status: "queued",
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      INSERT INTO remote_outbox (
        id, host, recipient_key, kind, payload_json, status, created_at, updated_at
      ) VALUES (@id, @host, @recipientKey, @kind, @payloadJson, @status, @createdAt, @updatedAt)
    `).run({
      id: record.id,
      host: record.host,
      recipientKey: record.recipientKey,
      kind: record.kind,
      payloadJson: JSON.stringify(record.payload),
      status: record.status,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    });
    return record;
  }

  claimNext(host: string): RemoteOutboxRecord | undefined {
    return this.db.transaction(() => {
      const row = this.db.prepare(`
        SELECT id FROM remote_outbox WHERE host=? AND status='queued' ORDER BY created_at LIMIT 1
      `).get(host) as { id: string } | undefined;
      if (!row) return undefined;
      const token = crypto.randomUUID();
      const changed = this.db.prepare(`
        UPDATE remote_outbox SET status='sending', delivery_token=?, updated_at=?
        WHERE id=? AND host=? AND status='queued'
      `).run(token, new Date().toISOString(), row.id, host).changes;
      return changed === 1 ? this.loadOutbox(row.id) : undefined;
    })();
  }

  settleOutbox(input: {
    id: string;
    deliveryToken: string;
    status: "sent" | "uncertain";
    remoteMessageId?: string;
    error?: string;
  }): RemoteOutboxRecord {
    const result = this.db.prepare(`
      UPDATE remote_outbox SET status=@status, remote_message_id=@remoteMessageId,
        error=@error, updated_at=@now
      WHERE id=@id AND status='sending' AND delivery_token=@deliveryToken
    `).run({ ...input, remoteMessageId: input.remoteMessageId ?? null, error: input.error ?? null, now: new Date().toISOString() });
    if (result.changes !== 1) throw new Error(`Remote outbox ${input.id} lost its delivery claim.`);
    return this.loadOutbox(input.id)!;
  }

  deferOutbox(id: string, deliveryToken: string, reason: string): void {
    const changed = this.db.prepare(`
      UPDATE remote_outbox SET status='queued', delivery_token=NULL, error=?, updated_at=?
      WHERE id=? AND status='sending' AND delivery_token=?
    `).run(reason, new Date().toISOString(), id, deliveryToken).changes;
    if (changed !== 1) throw new Error(`Remote outbox ${id} lost its delivery claim.`);
  }

  recoverSending(host: string): number {
    return this.db.prepare(`
      UPDATE remote_outbox SET status='uncertain',
        error=COALESCE(error, 'Delivery owner stopped before acknowledgement.'), updated_at=?
      WHERE host=? AND status='sending'
    `).run(new Date().toISOString(), host).changes;
  }

  listOutbox(host: string, statuses?: readonly RemoteOutboxStatus[]): RemoteOutboxRecord[] {
    const rows = this.db.prepare("SELECT * FROM remote_outbox WHERE host=? ORDER BY created_at")
      .all(host) as RemoteOutboxRow[];
    const filter = new Set(statuses ?? []);
    return rows.map(fromOutboxRow).filter((row) => filter.size === 0 || filter.has(row.status));
  }

  private loadOutbox(id: string): RemoteOutboxRecord | undefined {
    const row = this.db.prepare("SELECT * FROM remote_outbox WHERE id=?").get(id) as RemoteOutboxRow | undefined;
    return row ? fromOutboxRow(row) : undefined;
  }
}

interface RemoteOutboxRow {
  id: string; host: string; recipient_key: string; kind: string; payload_json: string; status: string;
  delivery_token: string | null; remote_message_id: string | null; error: string | null;
  created_at: string; updated_at: string;
}

function fromOutboxRow(row: RemoteOutboxRow): RemoteOutboxRecord {
  return {
    id: row.id,
    host: row.host,
    recipientKey: row.recipient_key,
    kind: row.kind as RemoteOutboxRecord["kind"],
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
    status: row.status as RemoteOutboxStatus,
    deliveryToken: row.delivery_token ?? undefined,
    remoteMessageId: row.remote_message_id ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
