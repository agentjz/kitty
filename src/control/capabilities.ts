import crypto from "node:crypto";

import type { CapabilityDefinition, CapabilityHealthStatus } from "../capabilities/types.js";
import { buildLeaseDeadline, DEFAULT_LEASE_MS, LeaseOwnershipLostError } from "./lease.js";
import type { ControlDatabase } from "./sqlite.js";

export interface DurableCapabilityState {
  id: string;
  kind: CapabilityDefinition["kind"];
  version: string;
  enabled: boolean;
  status: CapabilityHealthStatus;
  healthMessage?: string;
  operationId?: string;
  operationKind?: "start" | "stop" | "configure";
  ownerToken?: string;
  ownerGeneration: number;
  ownerPid?: number;
  ownerIdentity?: Record<string, unknown>;
  childPid?: number;
  childIdentity?: Record<string, unknown>;
  heartbeatAt?: string;
  leaseExpiresAt?: string;
  updatedAt: string;
}

interface CapabilityStateRow {
  capability_id: string;
  kind: string;
  version: string;
  enabled: number;
  status: string;
  health_message: string | null;
  operation_id: string | null;
  operation_kind: string | null;
  owner_token: string | null;
  owner_generation: number;
  owner_pid: number | null;
  owner_identity_json: string | null;
  child_pid: number | null;
  child_identity_json: string | null;
  heartbeat_at: string | null;
  lease_expires_at: string | null;
  updated_at: string;
}

export class CapabilityStateLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  ensure(definition: CapabilityDefinition): DurableCapabilityState {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO capability_states (
        capability_id, kind, version, enabled, status, owner_generation, updated_at
      ) VALUES (@id, @kind, @version, @enabled, @status, 0, @now)
      ON CONFLICT(capability_id) DO UPDATE SET
        kind=excluded.kind, version=excluded.version, updated_at=excluded.updated_at
    `).run({
      id: definition.id,
      kind: definition.kind,
      version: definition.version,
      enabled: definition.defaultEnabled ? 1 : 0,
      status: definition.defaultEnabled ? "stopped" : "disabled",
      now,
    });
    return this.require(definition.id);
  }

  setEnabled(definition: CapabilityDefinition, enabled: boolean): DurableCapabilityState {
    if (!enabled && !definition.canDisable) {
      throw new Error(`Capability ${definition.id} cannot be disabled.`);
    }
    const current = this.ensure(definition);
    if (current.enabled === enabled) return current;
    const now = new Date().toISOString();
    const operationId = crypto.randomUUID();
    this.db.prepare(`
      UPDATE capability_states SET
        enabled=@enabled, status=@status, health_message=NULL,
        operation_id=@operationId, operation_kind=@operationKind,
        owner_token=NULL, owner_pid=NULL, owner_identity_json=NULL,
        child_pid=NULL, child_identity_json=NULL,
        heartbeat_at=NULL, lease_expires_at=NULL, updated_at=@now
      WHERE capability_id=@id
    `).run({
      id: definition.id,
      enabled: enabled ? 1 : 0,
      status: enabled ? "starting" : "stopped",
      operationId,
      operationKind: enabled ? "start" : "stop",
      now,
    });
    return this.require(definition.id);
  }

  updateHealth(input: {
    id: string;
    status: CapabilityHealthStatus;
    message?: string;
  }): DurableCapabilityState {
    const current = this.require(input.id);
    const status = current.enabled ? input.status : "disabled";
    if (current.status === status && current.healthMessage === input.message) return current;
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE capability_states SET status=@status, health_message=@message, updated_at=@now
      WHERE capability_id=@id
    `).run({ id: input.id, status, message: input.message ?? null, now });
    return this.require(input.id);
  }

  claimRuntime(input: {
    definition: CapabilityDefinition;
    processId: number;
    processIdentity?: Record<string, unknown>;
    leaseMs?: number;
  }): DurableCapabilityState {
    return this.db.transaction(() => {
      const current = this.ensure(input.definition);
      if (!current.enabled) throw new Error(`Capability ${input.definition.id} is disabled.`);
      const now = new Date();
      const nowIso = now.toISOString();
      if (current.ownerToken && current.leaseExpiresAt && current.leaseExpiresAt > nowIso) {
        throw new Error(`Capability ${input.definition.id} already has an active owner generation ${current.ownerGeneration}.`);
      }
      const ownerToken = crypto.randomUUID();
      const operationId = crypto.randomUUID();
      this.db.prepare(`
        UPDATE capability_states SET
          status='starting', health_message=NULL, operation_id=@operationId, operation_kind='start',
          owner_token=@ownerToken, owner_generation=owner_generation + 1,
          owner_pid=@processId, owner_identity_json=@processIdentity,
          child_pid=NULL, child_identity_json=NULL,
          heartbeat_at=@now, lease_expires_at=@leaseExpiresAt, updated_at=@now
        WHERE capability_id=@id AND enabled=1
          AND (owner_token IS NULL OR lease_expires_at IS NULL OR lease_expires_at <= @now)
      `).run({
        id: input.definition.id,
        operationId,
        ownerToken,
        processId: input.processId,
        processIdentity: input.processIdentity ? JSON.stringify(input.processIdentity) : null,
        now: nowIso,
        leaseExpiresAt: buildLeaseDeadline(now, input.leaseMs ?? DEFAULT_LEASE_MS),
      });
      const claimed = this.require(input.definition.id);
      if (claimed.ownerToken !== ownerToken) {
        throw new Error(`Capability ${input.definition.id} could not claim its runtime owner.`);
      }
      return claimed;
    })();
  }

  attachChild(input: {
    id: string;
    ownerToken: string;
    ownerGeneration: number;
    childPid: number;
    childIdentity?: Record<string, unknown>;
  }): DurableCapabilityState {
    const now = new Date().toISOString();
    const updated = this.db.prepare(`
      UPDATE capability_states SET child_pid=@childPid, child_identity_json=@childIdentity, updated_at=@now
      WHERE capability_id=@id AND owner_token=@ownerToken AND owner_generation=@ownerGeneration
    `).run({
      ...input,
      childIdentity: input.childIdentity ? JSON.stringify(input.childIdentity) : null,
      now,
    });
    if (updated.changes !== 1) throw new LeaseOwnershipLostError("capability", input.id);
    return this.require(input.id);
  }

  heartbeat(input: {
    id: string;
    ownerToken: string;
    ownerGeneration: number;
    leaseMs?: number;
  }): DurableCapabilityState {
    const now = new Date();
    const updated = this.db.prepare(`
      UPDATE capability_states SET heartbeat_at=@now, lease_expires_at=@expires, updated_at=@now
      WHERE capability_id=@id AND owner_token=@ownerToken AND owner_generation=@ownerGeneration
    `).run({
      ...input,
      now: now.toISOString(),
      expires: buildLeaseDeadline(now, input.leaseMs ?? DEFAULT_LEASE_MS),
    });
    if (updated.changes !== 1) throw new LeaseOwnershipLostError("capability", input.id);
    return this.require(input.id);
  }

  settleOwned(input: {
    id: string;
    ownerToken: string;
    ownerGeneration: number;
    status: "ready" | "degraded" | "stopped";
    message?: string;
    release?: boolean;
  }): DurableCapabilityState {
    const now = new Date().toISOString();
    const release = input.release === true;
    const updated = this.db.prepare(`
      UPDATE capability_states SET
        status=@status, health_message=@message,
        owner_token=CASE WHEN @release=1 THEN NULL ELSE owner_token END,
        owner_pid=CASE WHEN @release=1 THEN NULL ELSE owner_pid END,
        owner_identity_json=CASE WHEN @release=1 THEN NULL ELSE owner_identity_json END,
        child_pid=CASE WHEN @release=1 THEN NULL ELSE child_pid END,
        child_identity_json=CASE WHEN @release=1 THEN NULL ELSE child_identity_json END,
        heartbeat_at=CASE WHEN @release=1 THEN NULL ELSE heartbeat_at END,
        lease_expires_at=CASE WHEN @release=1 THEN NULL ELSE lease_expires_at END,
        updated_at=@now
      WHERE capability_id=@id AND owner_token=@ownerToken AND owner_generation=@ownerGeneration
    `).run({
      ...input,
      message: input.message ?? null,
      release: release ? 1 : 0,
      now,
    });
    if (updated.changes !== 1) throw new LeaseOwnershipLostError("capability", input.id);
    return this.require(input.id);
  }

  listExpiredOwned(now = new Date()): DurableCapabilityState[] {
    return (this.db.prepare(`
      SELECT * FROM capability_states
      WHERE owner_token IS NOT NULL AND lease_expires_at IS NOT NULL AND lease_expires_at <= ?
      ORDER BY updated_at ASC
    `).all(now.toISOString()) as CapabilityStateRow[]).map(fromRow);
  }

  list(): DurableCapabilityState[] {
    return (this.db.prepare("SELECT * FROM capability_states ORDER BY capability_id ASC").all() as CapabilityStateRow[])
      .map(fromRow);
  }

  load(id: string): DurableCapabilityState | undefined {
    const row = this.db.prepare("SELECT * FROM capability_states WHERE capability_id=?").get(id) as CapabilityStateRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  removeSkill(id: string): boolean {
    const removed = this.db.prepare(`
      DELETE FROM capability_states
      WHERE capability_id=? AND kind='skill' AND owner_token IS NULL
    `).run(id);
    return removed.changes === 1;
  }

  private require(id: string): DurableCapabilityState {
    const state = this.load(id);
    if (!state) throw new Error(`Unknown capability state: ${id}.`);
    return state;
  }
}

function fromRow(row: CapabilityStateRow): DurableCapabilityState {
  return {
    id: row.capability_id,
    kind: row.kind as DurableCapabilityState["kind"],
    version: row.version,
    enabled: row.enabled === 1,
    status: row.status as CapabilityHealthStatus,
    healthMessage: row.health_message ?? undefined,
    operationId: row.operation_id ?? undefined,
    operationKind: row.operation_kind as DurableCapabilityState["operationKind"] ?? undefined,
    ownerToken: row.owner_token ?? undefined,
    ownerGeneration: row.owner_generation,
    ownerPid: row.owner_pid ?? undefined,
    ownerIdentity: parseJson(row.owner_identity_json),
    childPid: row.child_pid ?? undefined,
    childIdentity: parseJson(row.child_identity_json),
    heartbeatAt: row.heartbeat_at ?? undefined,
    leaseExpiresAt: row.lease_expires_at ?? undefined,
    updatedAt: row.updated_at,
  };
}

function parseJson(value: string | null): Record<string, unknown> | undefined {
  return value ? JSON.parse(value) as Record<string, unknown> : undefined;
}
