import crypto from "node:crypto";

import type { ControlDatabase } from "./sqlite.js";

export interface ServiceLeaseRecord {
  name: string;
  ownerToken: string;
  generation: number;
  processId: number;
  leaseExpiresAt: string;
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
    `).run({ name: lease.name, ownerToken: lease.ownerToken, generation: lease.generation, now });
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
