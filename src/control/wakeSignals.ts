import type Database from "better-sqlite3";

import { createControlPlaneId } from "./shared.js";
import type { WakeSignalReason, WakeSignalRecord } from "./types.js";

interface WakeSignalRow {
  id: string;
  execution_id: string;
  reason: string;
  created_at: string;
}

export class WakeSignalLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  publish(input: { executionId: string; reason: WakeSignalReason; createdAt?: string }): WakeSignalRecord {
    const record: WakeSignalRecord = {
      id: createControlPlaneId("wake"),
      executionId: input.executionId,
      reason: input.reason,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO wake_signals (id, execution_id, reason, created_at)
      VALUES (@id, @executionId, @reason, @createdAt)
    `).run(record);
    return record;
  }

  list(): WakeSignalRecord[] {
    return (this.db.prepare("SELECT * FROM wake_signals ORDER BY created_at ASC").all() as WakeSignalRow[])
      .map((row) => ({
        id: row.id,
        executionId: row.execution_id,
        reason: row.reason as WakeSignalReason,
        createdAt: row.created_at,
      }));
  }
}

