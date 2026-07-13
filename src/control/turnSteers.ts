import crypto from "node:crypto";
import type { ControlDatabase } from "./sqlite.js";

export type TurnSteerStatus = "pending" | "consumed" | "rejected";

export interface TurnSteerRecord {
  id: string;
  turnId: string;
  sessionId: string;
  sequence: number;
  input: string;
  messageId: string;
  status: TurnSteerStatus;
  consumedGeneration?: number;
  rejectionReason?: string;
  createdAt: string;
  consumedAt?: string;
  rejectedAt?: string;
}

interface TurnSteerRow {
  id: string;
  turn_id: string;
  session_id: string;
  sequence: number;
  input: string;
  message_id: string;
  status: string;
  consumed_generation: number | null;
  rejection_reason: string | null;
  created_at: string;
  consumed_at: string | null;
  rejected_at: string | null;
}

export class TurnSteerLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  admit(input: { turnId: string; sessionId: string; text: string }): TurnSteerRecord | undefined {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const turn = this.db.prepare(`
        SELECT status, session_id, lease_expires_at
        FROM session_turns
        WHERE id = ?
      `).get(input.turnId) as {
        status: string;
        session_id: string;
        lease_expires_at: string | null;
      } | undefined;

      if (!turn || turn.session_id !== input.sessionId) return undefined;
      if (turn.status !== "queued" && turn.status !== "running") return undefined;
      if (turn.status === "running" && turn.lease_expires_at && turn.lease_expires_at <= now) return undefined;

      const sequence = Number((this.db.prepare(`
        SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence
        FROM turn_steers
        WHERE turn_id = ?
      `).get(input.turnId) as { sequence: number }).sequence);
      const id = `steer-${crypto.randomUUID()}`;
      const record: TurnSteerRecord = {
        id,
        turnId: input.turnId,
        sessionId: input.sessionId,
        sequence,
        input: input.text,
        messageId: `msg-${id}`,
        status: "pending",
        createdAt: now,
      };
      this.db.prepare(`
        INSERT INTO turn_steers (
          id, turn_id, session_id, sequence, input, message_id, status, created_at
        ) VALUES (
          @id, @turnId, @sessionId, @sequence, @input, @messageId, @status, @createdAt
        )
      `).run(record);
      return record;
    })();
  }

  listPending(turnId: string): TurnSteerRecord[] {
    return (this.db.prepare(`
      SELECT * FROM turn_steers
      WHERE turn_id = ? AND status = 'pending'
      ORDER BY sequence ASC
    `).all(turnId) as TurnSteerRow[]).map(fromRow);
  }

  listByTurn(turnId: string): TurnSteerRecord[] {
    return (this.db.prepare(`
      SELECT * FROM turn_steers
      WHERE turn_id = ?
      ORDER BY sequence ASC
    `).all(turnId) as TurnSteerRow[]).map(fromRow);
  }

  markConsumed(input: { steerId: string; turnId: string; ownerToken: string; ownerGeneration: number }): TurnSteerRecord {
    const now = new Date().toISOString();
    const result = this.db.prepare(`
      UPDATE turn_steers
      SET status = 'consumed', consumed_at = @now,
          consumed_generation = (
            SELECT owner_generation FROM session_turns WHERE id = @turnId
          )
      WHERE id = @steerId
        AND turn_id = @turnId
        AND status = 'pending'
        AND EXISTS (
          SELECT 1 FROM session_turns
          WHERE id = @turnId
            AND owner_token = @ownerToken
            AND owner_generation=@ownerGeneration
            AND status = 'running'
            AND lease_expires_at > @now
        )
    `).run({ ...input, now });
    if (result.changes !== 1) {
      const existing = this.load(input.steerId);
      const owner = this.db.prepare(`
        SELECT owner_generation AS generation FROM session_turns
        WHERE id=@turnId AND owner_token=@ownerToken
      `).get({ turnId: input.turnId, ownerToken: input.ownerToken }) as { generation: number } | undefined;
      if (existing?.status === "consumed" && owner && existing.consumedGeneration === owner.generation) return existing;
      throw new Error(`Steer ${input.steerId} cannot be consumed without the active turn lease.`);
    }
    return this.load(input.steerId)!;
  }

  rejectPending(turnId: string, reason: string): number {
    const now = new Date().toISOString();
    return this.db.prepare(`
      UPDATE turn_steers
      SET status = 'rejected', rejection_reason = @reason, rejected_at = @now
      WHERE turn_id = @turnId AND status = 'pending'
    `).run({ turnId, reason, now }).changes;
  }

  load(id: string): TurnSteerRecord | undefined {
    const row = this.db.prepare("SELECT * FROM turn_steers WHERE id = ?").get(id) as TurnSteerRow | undefined;
    return row ? fromRow(row) : undefined;
  }
}

function fromRow(row: TurnSteerRow): TurnSteerRecord {
  return {
    id: row.id,
    turnId: row.turn_id,
    sessionId: row.session_id,
    sequence: row.sequence,
    input: row.input,
    messageId: row.message_id,
    status: row.status as TurnSteerStatus,
    consumedGeneration: row.consumed_generation ?? undefined,
    rejectionReason: row.rejection_reason ?? undefined,
    createdAt: row.created_at,
    consumedAt: row.consumed_at ?? undefined,
    rejectedAt: row.rejected_at ?? undefined,
  };
}
