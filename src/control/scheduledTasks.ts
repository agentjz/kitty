import crypto from "node:crypto";

import type {
  ScheduledAction,
  ScheduledTaskRecord,
  ScheduledTriggerRecord,
  ScheduledTriggerStatus,
  ScheduleSpec,
} from "../scheduler/types.js";
import type { ControlDatabase } from "./sqlite.js";
import { createControlPlaneId } from "./shared.js";

const CLAIM_LEASE_MS = 30_000;

export class ScheduledTaskLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  create(input: Omit<ScheduledTaskRecord, "id" | "runCount" | "createdAt" | "updatedAt">): ScheduledTaskRecord {
    const now = new Date().toISOString();
    const record: ScheduledTaskRecord = {
      ...input,
      id: createControlPlaneId("schedule"),
      runCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    this.db.prepare(`
      INSERT INTO scheduled_tasks (
        id, name, enabled, action_json, schedule_json, next_run_at, creator_session_id,
        last_trigger_at, run_count, created_at, updated_at
      ) VALUES (
        @id, @name, @enabled, @actionJson, @scheduleJson, @nextRunAt, @creatorSessionId,
        NULL, 0, @createdAt, @updatedAt
      )
    `).run(toTaskRow(record));
    return record;
  }

  load(id: string): ScheduledTaskRecord | undefined {
    const row = this.db.prepare("SELECT * FROM scheduled_tasks WHERE id=?").get(id) as ScheduledTaskRow | undefined;
    return row ? fromTaskRow(row) : undefined;
  }

  list(): ScheduledTaskRecord[] {
    return (this.db.prepare("SELECT * FROM scheduled_tasks ORDER BY created_at").all() as ScheduledTaskRow[])
      .map(fromTaskRow);
  }

  listDue(now = new Date()): ScheduledTaskRecord[] {
    return (this.db.prepare(`
      SELECT * FROM scheduled_tasks
      WHERE enabled=1 AND next_run_at IS NOT NULL AND next_run_at <= ?
      ORDER BY next_run_at, created_at
    `).all(now.toISOString()) as ScheduledTaskRow[]).map(fromTaskRow);
  }

  nextDeadline(): string | undefined {
    const row = this.db.prepare(`
      SELECT next_run_at FROM scheduled_tasks
      WHERE enabled=1 AND next_run_at IS NOT NULL
      ORDER BY next_run_at LIMIT 1
    `).get() as { next_run_at: string } | undefined;
    return row?.next_run_at;
  }

  save(record: ScheduledTaskRecord): ScheduledTaskRecord {
    const updatedAt = new Date().toISOString();
    const row = toTaskRow({ ...record, updatedAt });
    const changed = this.db.prepare(`
      UPDATE scheduled_tasks SET
        name=@name, enabled=@enabled, action_json=@actionJson, schedule_json=@scheduleJson,
        next_run_at=@nextRunAt, creator_session_id=@creatorSessionId, updated_at=@updatedAt
      WHERE id=@id
    `).run({
      id: row.id,
      name: row.name,
      enabled: row.enabled,
      actionJson: row.actionJson,
      scheduleJson: row.scheduleJson,
      nextRunAt: row.nextRunAt,
      creatorSessionId: row.creatorSessionId,
      updatedAt: row.updatedAt,
    }).changes;
    if (changed !== 1) throw new Error(`Unknown scheduled task: ${record.id}.`);
    return this.load(record.id)!;
  }

  delete(id: string): boolean {
    return this.db.prepare(`
      DELETE FROM scheduled_tasks WHERE id=? AND NOT EXISTS (
        SELECT 1 FROM scheduled_triggers WHERE task_id=? AND status='claimed'
      )
    `).run(id, id).changes === 1;
  }

  claim(input: {
    taskId: string;
    scheduledFor: string;
    nextRunAt?: string;
    now?: Date;
  }): ScheduledTriggerRecord | undefined {
    return this.db.transaction(() => {
      const now = input.now ?? new Date();
      const nowIso = now.toISOString();
      const task = this.load(input.taskId);
      if (!task || !task.enabled || task.nextRunAt !== input.scheduledFor || input.scheduledFor > nowIso) {
        return undefined;
      }
      const claimToken = crypto.randomUUID();
      const trigger: ScheduledTriggerRecord = {
        id: createControlPlaneId("trigger"),
        taskId: task.id,
        scheduledFor: input.scheduledFor,
        status: "claimed",
        claimToken,
        claimExpiresAt: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
        createdAt: nowIso,
        updatedAt: nowIso,
      };
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO scheduled_triggers (
          id, task_id, scheduled_for, status, claim_token, claim_expires_at,
          execution_id, result_json, error, created_at, updated_at, finished_at
        ) VALUES (
          @id, @taskId, @scheduledFor, 'claimed', @claimToken, @claimExpiresAt,
          NULL, NULL, NULL, @createdAt, @updatedAt, NULL
        )
      `).run({
        id: trigger.id,
        taskId: trigger.taskId,
        scheduledFor: trigger.scheduledFor,
        claimToken: trigger.claimToken,
        claimExpiresAt: trigger.claimExpiresAt,
        createdAt: trigger.createdAt,
        updatedAt: trigger.updatedAt,
      }).changes;
      if (inserted !== 1) return undefined;
      this.db.prepare(`
        UPDATE scheduled_tasks SET enabled=@enabled, next_run_at=@nextRunAt, updated_at=@now
        WHERE id=@id AND enabled=1 AND next_run_at=@scheduledFor
      `).run({
        id: task.id,
        enabled: input.nextRunAt ? 1 : 0,
        nextRunAt: input.nextRunAt ?? null,
        scheduledFor: input.scheduledFor,
        now: nowIso,
      });
      return trigger;
    }).immediate();
  }

  heartbeat(trigger: Pick<ScheduledTriggerRecord, "id" | "claimToken">, now = new Date()): boolean {
    return this.db.prepare(`
      UPDATE scheduled_triggers SET claim_expires_at=@expires, updated_at=@now
      WHERE id=@id AND status='claimed' AND claim_token=@claimToken
    `).run({
      ...trigger,
      now: now.toISOString(),
      expires: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
    }).changes === 1;
  }

  reclaimExpired(now = new Date()): ScheduledTriggerRecord[] {
    const nowIso = now.toISOString();
    const rows = this.db.prepare(`
      SELECT id FROM scheduled_triggers
      WHERE status='claimed' AND claim_expires_at <= ? ORDER BY scheduled_for
    `).all(nowIso) as Array<{ id: string }>;
    const claimed: ScheduledTriggerRecord[] = [];
    for (const row of rows) {
      const token = crypto.randomUUID();
      const changed = this.db.prepare(`
        UPDATE scheduled_triggers SET claim_token=@token, claim_expires_at=@expires, updated_at=@now
        WHERE id=@id AND status='claimed' AND claim_expires_at <= @now
      `).run({
        id: row.id,
        token,
        now: nowIso,
        expires: new Date(now.getTime() + CLAIM_LEASE_MS).toISOString(),
      }).changes;
      if (changed === 1) claimed.push(this.loadTrigger(row.id)!);
    }
    return claimed;
  }

  linkExecution(trigger: Pick<ScheduledTriggerRecord, "id" | "claimToken">, executionId: string): void {
    const changed = this.db.prepare(`
      UPDATE scheduled_triggers SET execution_id=?, updated_at=?
      WHERE id=? AND status='claimed' AND claim_token=?
    `).run(executionId, new Date().toISOString(), trigger.id, trigger.claimToken).changes;
    if (changed !== 1) throw new Error(`Scheduled trigger ${trigger.id} lost its claim.`);
  }

  settle(input: {
    id: string;
    claimToken: string;
    status: Exclude<ScheduledTriggerStatus, "claimed">;
    result?: Record<string, unknown>;
    error?: string;
    executionId?: string;
  }): ScheduledTriggerRecord {
    return this.db.transaction(() => {
      const now = new Date().toISOString();
      const changed = this.db.prepare(`
        UPDATE scheduled_triggers SET
          status=@status, result_json=@resultJson, error=@error,
          execution_id=COALESCE(@executionId, execution_id), updated_at=@now, finished_at=@now
        WHERE id=@id AND status='claimed' AND claim_token=@claimToken
      `).run({
        id: input.id,
        claimToken: input.claimToken,
        status: input.status,
        resultJson: input.result ? JSON.stringify(input.result) : null,
        error: input.error ?? null,
        executionId: input.executionId ?? null,
        now,
      }).changes;
      if (changed !== 1) throw new Error(`Scheduled trigger ${input.id} lost its claim.`);
      const trigger = this.loadTrigger(input.id)!;
      this.db.prepare(`
        UPDATE scheduled_tasks SET last_trigger_at=?, run_count=run_count + 1, updated_at=? WHERE id=?
      `).run(trigger.scheduledFor, now, trigger.taskId);
      return trigger;
    }).immediate();
  }

  loadTrigger(id: string): ScheduledTriggerRecord | undefined {
    const row = this.db.prepare("SELECT * FROM scheduled_triggers WHERE id=?").get(id) as ScheduledTriggerRow | undefined;
    return row ? fromTriggerRow(row) : undefined;
  }

  listTriggers(taskId?: string, limit = 100): ScheduledTriggerRecord[] {
    const rows = taskId
      ? this.db.prepare("SELECT * FROM scheduled_triggers WHERE task_id=? ORDER BY created_at DESC LIMIT ?").all(taskId, limit)
      : this.db.prepare("SELECT * FROM scheduled_triggers ORDER BY created_at DESC LIMIT ?").all(limit);
    return (rows as ScheduledTriggerRow[]).map(fromTriggerRow);
  }
}

interface ScheduledTaskRow {
  id: string; name: string; enabled: number; action_json: string; schedule_json: string;
  next_run_at: string | null; creator_session_id: string | null; last_trigger_at: string | null;
  run_count: number; created_at: string; updated_at: string;
}

interface ScheduledTriggerRow {
  id: string; task_id: string; scheduled_for: string; status: string; claim_token: string;
  claim_expires_at: string; execution_id: string | null; result_json: string | null; error: string | null;
  created_at: string; updated_at: string; finished_at: string | null;
}

function toTaskRow(record: ScheduledTaskRecord): Record<string, unknown> {
  return {
    id: record.id,
    name: record.name,
    enabled: record.enabled ? 1 : 0,
    actionJson: JSON.stringify(record.action),
    scheduleJson: JSON.stringify(record.schedule),
    nextRunAt: record.nextRunAt ?? null,
    creatorSessionId: record.creatorSessionId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

function fromTaskRow(row: ScheduledTaskRow): ScheduledTaskRecord {
  return {
    id: row.id,
    name: row.name,
    enabled: row.enabled === 1,
    action: JSON.parse(row.action_json) as ScheduledAction,
    schedule: JSON.parse(row.schedule_json) as ScheduleSpec,
    nextRunAt: row.next_run_at ?? undefined,
    creatorSessionId: row.creator_session_id ?? undefined,
    lastTriggerAt: row.last_trigger_at ?? undefined,
    runCount: row.run_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function fromTriggerRow(row: ScheduledTriggerRow): ScheduledTriggerRecord {
  return {
    id: row.id,
    taskId: row.task_id,
    scheduledFor: row.scheduled_for,
    status: row.status as ScheduledTriggerStatus,
    claimToken: row.claim_token,
    claimExpiresAt: row.claim_expires_at,
    executionId: row.execution_id ?? undefined,
    result: row.result_json ? JSON.parse(row.result_json) as Record<string, unknown> : undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  };
}
