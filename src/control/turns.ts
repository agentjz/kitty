import crypto from "node:crypto";
import type Database from "better-sqlite3";

export type TurnStatus = "queued" | "running" | "closing" | "completed" | "failed" | "aborted";

export interface TurnRecord {
  id: string;
  sessionId: string;
  input: string;
  inputSource: "external" | "internal";
  status: TurnStatus;
  ownerToken?: string;
  ownerGeneration: number;
  leaseExpiresAt?: string;
  heartbeatAt?: string;
  error?: string;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
}

interface TurnRow {
  id: string;
  session_id: string;
  input: string;
  input_source: string;
  status: string;
  owner_token: string | null;
  owner_generation: number;
  lease_expires_at: string | null;
  heartbeat_at: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
}

const LEASE_MS = 30_000;

export class TurnLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  admit(input: { sessionId: string; input: string; inputSource: "external" | "internal" }): TurnRecord {
    const now = new Date().toISOString();
    const record: TurnRecord = {
      id: `turn-${crypto.randomUUID()}`,
      sessionId: input.sessionId,
      input: input.input,
      inputSource: input.inputSource,
      status: "queued",
      ownerGeneration: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      INSERT INTO session_turns (id, session_id, input, input_source, status, created_at, updated_at)
      VALUES (@id, @sessionId, @input, @inputSource, @status, @createdAt, @updatedAt)
    `).run(record);
    return record;
  }

  claim(id: string): TurnRecord | undefined {
    return this.db.transaction(() => {
      const now = new Date();
      const nowIso = now.toISOString();
      const candidate = this.load(id);
      if (!candidate || candidate.status !== "queued") return undefined;
      const sessionId = candidate.sessionId;
      this.reconcileExpired(sessionId, now);
      const active = this.db.prepare(`
        SELECT 1 FROM session_turns
        WHERE session_id=? AND status IN ('running', 'closing') AND lease_expires_at > ? LIMIT 1
      `).get(sessionId, nowIso);
      if (active) return undefined;
      const row = this.db.prepare(`
        SELECT id FROM session_turns
        WHERE session_id=? AND status='queued'
        ORDER BY created_at ASC LIMIT 1
      `).get(sessionId) as { id: string } | undefined;
      if (!row || row.id !== id) return undefined;
      const token = crypto.randomUUID();
      const lease = new Date(now.getTime() + LEASE_MS).toISOString();
      const claimed = this.db.prepare(`
        UPDATE session_turns
        SET status='running', owner_token=@token, lease_expires_at=@lease,
            owner_generation=owner_generation + 1,
            heartbeat_at=@now, started_at=COALESCE(started_at, @now), updated_at=@now, error=NULL
        WHERE id=@id AND status='queued'
      `).run({ id: row.id, token, lease, now: nowIso });
      return claimed.changes === 1 ? this.load(row.id) : undefined;
    })();
  }

  heartbeat(id: string, ownerToken: string, ownerGeneration: number): TurnRecord {
    const now = new Date();
    const nowIso = now.toISOString();
    const lease = new Date(now.getTime() + LEASE_MS).toISOString();
    const result = this.db.prepare(`
      UPDATE session_turns
      SET heartbeat_at=@now, lease_expires_at=@lease, updated_at=@now
      WHERE id=@id AND status IN ('running', 'closing') AND owner_token=@ownerToken
        AND owner_generation=@ownerGeneration
        AND lease_expires_at > @now
    `).run({ id, ownerToken, ownerGeneration, now: nowIso, lease });
    if (result.changes !== 1) throw new Error(`Turn ${id} no longer owns its lease.`);
    return this.load(id)!;
  }

  assertOwner(id: string, ownerToken: string, ownerGeneration: number): void {
    const now = new Date().toISOString();
    const row = this.db.prepare(`
      SELECT 1 FROM session_turns
      WHERE id=? AND status IN ('running', 'closing') AND owner_token=? AND lease_expires_at > ?
        AND owner_generation=?
    `).get(id, ownerToken, now, ownerGeneration);
    if (!row) throw new Error(`Turn ${id} no longer owns its session lease.`);
  }

  beginClosing(id: string, ownerToken: string, ownerGeneration: number): boolean {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const pending = this.db.prepare(`
        SELECT 1 FROM turn_steers
        WHERE turn_id = ? AND status = 'pending'
        LIMIT 1
      `).get(id);
      if (pending) return false;
      const result = this.db.prepare(`
        UPDATE session_turns
        SET status = 'closing', updated_at = @now
        WHERE id = @id
          AND status = 'running'
          AND owner_token = @ownerToken
          AND owner_generation = @ownerGeneration
          AND lease_expires_at > @now
      `).run({ id, ownerToken, ownerGeneration, now });
      if (result.changes === 1) return true;
      const current = this.load(id);
      return current?.status === "closing" && current.ownerToken === ownerToken &&
        current.ownerGeneration === ownerGeneration &&
        Boolean(current.leaseExpiresAt && current.leaseExpiresAt > now);
    })();
  }

  finish(id: string, ownerToken: string, ownerGeneration: number, status: Exclude<TurnStatus, "queued" | "running" | "closing">, error?: string): TurnRecord {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE session_turns
      SET status=@status, error=@error, updated_at=@now, finished_at=@now, lease_expires_at=NULL
      WHERE id=@id AND status IN ('running', 'closing') AND owner_token=@ownerToken
        AND owner_generation=@ownerGeneration
        AND lease_expires_at > @now
    `).run({ id, ownerToken, ownerGeneration, status, error, now });
    if (result.changes !== 1) throw new Error(`Turn ${id} cannot finish without its active lease.`);
    return this.load(id)!;
  }

  abortQueued(id: string, error = "Turn admission aborted before execution."): TurnRecord {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        UPDATE session_turns
        SET status='aborted', error=@error, updated_at=@now, finished_at=@now
        WHERE id=@id AND status='queued'
      `).run({ id, error, now });
      if (result.changes !== 1) throw new Error(`Turn ${id} is no longer queued.`);
      this.db.prepare(`
        UPDATE turn_steers
        SET status='rejected', rejection_reason=@error, rejected_at=@now
        WHERE turn_id=@id AND status='pending'
      `).run({ id, error, now });
      return this.load(id)!;
    })();
  }

  detachForRecovery(id: string, ownerToken: string, ownerGeneration: number, reason: string): TurnRecord {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE session_turns
      SET status='queued', error=@reason, updated_at=@now,
          owner_token=NULL, heartbeat_at=NULL, lease_expires_at=NULL, finished_at=NULL
      WHERE id=@id AND status='running' AND owner_token=@ownerToken
        AND owner_generation=@ownerGeneration
        AND lease_expires_at > @now
    `).run({ id, ownerToken, ownerGeneration, reason, now });
    if (result.changes !== 1) throw new Error(`Turn ${id} cannot detach without its active lease.`);
    return this.load(id)!;
  }

  reconcileExpired(sessionId: string, now = new Date()): number {
    const nowIso = now.toISOString();
    return this.db.transaction(() => {
      const resumable = this.db.prepare(`
        UPDATE session_turns
        SET status='queued', error='Turn lease expired and was admitted for recovery.', updated_at=@now,
            owner_token=NULL, heartbeat_at=NULL, lease_expires_at=NULL, finished_at=NULL
        WHERE session_id=@sessionId AND status='running'
          AND lease_expires_at IS NOT NULL AND lease_expires_at <= @now
      `).run({ sessionId, now: nowIso }).changes;
      const uncertainClose = this.db.prepare(`
        UPDATE session_turns
        SET status='failed', error='Turn lease expired while final output was closing.', updated_at=@now,
            finished_at=@now, owner_token=NULL, heartbeat_at=NULL, lease_expires_at=NULL
        WHERE session_id=@sessionId AND status='closing'
          AND lease_expires_at IS NOT NULL AND lease_expires_at <= @now
      `).run({ sessionId, now: nowIso }).changes;
      return resumable + uncertainClose;
    })();
  }

  listPending(sessionId: string): TurnRecord[] {
    return (this.db.prepare(`
      SELECT * FROM session_turns
      WHERE session_id=? AND status IN ('running', 'closing', 'queued')
      ORDER BY created_at ASC
    `).all(sessionId) as TurnRow[]).map(fromRow);
  }

  listBySession(sessionId: string): TurnRecord[] {
    return (this.db.prepare(`
      SELECT * FROM session_turns WHERE session_id=? ORDER BY created_at ASC
    `).all(sessionId) as TurnRow[]).map(fromRow);
  }

  load(id: string): TurnRecord | undefined {
    const row = this.db.prepare("SELECT * FROM session_turns WHERE id=?").get(id) as TurnRow | undefined;
    return row ? fromRow(row) : undefined;
  }
}

function fromRow(row: TurnRow): TurnRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    input: row.input,
    inputSource: row.input_source === "internal" ? "internal" : "external",
    status: row.status as TurnStatus,
    ownerToken: row.owner_token ?? undefined,
    ownerGeneration: row.owner_generation,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    heartbeatAt: row.heartbeat_at ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  };
}
