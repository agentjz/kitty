import { buildLeaseDeadline, DEFAULT_LEASE_MS, LeaseOwnershipLostError } from "./lease.js";
import type { ControlDatabase } from "./sqlite.js";

export interface TurnLeaseOwnership {
  turnId: string;
  ownerToken: string;
  ownerGeneration: number;
  sessionId?: string;
}

export function renewTurnLease(
  db: ControlDatabase,
  ownership: TurnLeaseOwnership,
  options: { allowClosing?: boolean; leaseMs?: number; now?: Date } = {},
): { heartbeatAt: string; leaseExpiresAt: string } {
  const now = options.now ?? new Date();
  const heartbeatAt = now.toISOString();
  const leaseExpiresAt = buildLeaseDeadline(now, options.leaseMs ?? DEFAULT_LEASE_MS);
  const result = db.prepare(`
    UPDATE session_turns
    SET heartbeat_at=@heartbeatAt, lease_expires_at=@leaseExpiresAt, updated_at=@heartbeatAt
    WHERE id=@turnId
      AND owner_token=@ownerToken
      AND owner_generation=@ownerGeneration
      AND (@sessionId IS NULL OR session_id=@sessionId)
      AND (status='running' OR (@allowClosing=1 AND status='closing'))
  `).run({
    turnId: ownership.turnId,
    ownerToken: ownership.ownerToken,
    ownerGeneration: ownership.ownerGeneration,
    sessionId: ownership.sessionId ?? null,
    allowClosing: options.allowClosing ? 1 : 0,
    heartbeatAt,
    leaseExpiresAt,
  });
  if (result.changes !== 1) {
    throw new LeaseOwnershipLostError("turn", ownership.turnId);
  }
  return { heartbeatAt, leaseExpiresAt };
}
