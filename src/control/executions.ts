import type Database from "better-sqlite3";
import crypto from "node:crypto";
import path from "node:path";

import { unknownExecution } from "../execution/errors.js";
import { buildDeadlineAt, fromExecutionRow, toExecutionRow, type ExecutionRow } from "./executionRows.js";
import { createControlPlaneId } from "./shared.js";
import type { ExecutionOwnership, ExecutionRecord, ExecutionStatus } from "./types.js";
import type { ExecutionKind } from "../execution/kinds.js";

export class ExecutionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    id?: string;
    kind?: ExecutionKind;
    status?: Extract<ExecutionStatus, "created" | "running">;
    command: string;
    cwd: string;
    requestedBy: string;
    ownerSessionId: string;
    createdBySessionId: string;
    parentTurnId: string;
    originToolCallId: string;
    pid?: number;
    processIdentity?: Record<string, unknown>;
    timeoutMs?: number;
    deadlineAt?: string;
  }): ExecutionRecord {
    const now = new Date().toISOString();
    const controllerLeaseExpiresAt = new Date(Date.now() + 30_000).toISOString();
    const record: ExecutionRecord = {
      id: input.id ?? createControlPlaneId("exec"),
      kind: input.kind ?? "background",
      status: input.status ?? "created",
      command: input.command,
      cwd: path.resolve(input.cwd),
      requestedBy: input.requestedBy,
      ownerSessionId: input.ownerSessionId,
      createdBySessionId: input.createdBySessionId,
      parentTurnId: input.parentTurnId,
      originToolCallId: input.originToolCallId,
      version: 1,
      controllerToken: crypto.randomUUID(),
      controllerGeneration: 1,
      controllerLeaseExpiresAt,
      controllerHeartbeatAt: now,
      pid: input.pid,
      processIdentity: input.processIdentity,
      deadlineAt: input.deadlineAt ?? buildDeadlineAt(now, input.timeoutMs),
      createdAt: now,
      startedAt: input.status === "running" ? now : undefined,
      updatedAt: now,
      timeoutMs: input.timeoutMs,
    };
    this.db.prepare(`
      INSERT INTO executions (
        id, kind, status, command, cwd, requested_by, owner_session_id, created_by_session_id,
        parent_turn_id, origin_tool_call_id, version, controller_token, controller_generation,
        controller_lease_expires_at, controller_heartbeat_at, pid, process_identity_json,
        exit_code, output, summary, deadline_at,
        last_output_at, close_reason, terminated_by, error, created_at, started_at, updated_at,
        finished_at, timeout_ms
      ) VALUES (
        @id, @kind, @status, @command, @cwd, @requestedBy, @ownerSessionId, @createdBySessionId,
        @parentTurnId, @originToolCallId, @version, @controllerToken, @controllerGeneration,
        @controllerLeaseExpiresAt, @controllerHeartbeatAt, @pid, @processIdentityJson,
        @exitCode, @output, @summary, @deadlineAt,
        @lastOutputAt, @closeReason, @terminatedBy, @error, @createdAt, @startedAt, @updatedAt,
        @finishedAt, @timeoutMs
      )
    `).run(toExecutionRow(record));
    return record;
  }

  load(id: string): ExecutionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM executions WHERE id = ?").get(id);
    return row ? fromExecutionRow(row as ExecutionRow) : undefined;
  }

  loadOwned(id: string, ownerSessionId: string): ExecutionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM executions WHERE id = ? AND owner_session_id = ?").get(id, ownerSessionId);
    return row ? fromExecutionRow(row as ExecutionRow) : undefined;
  }

  list(input: {
    statuses?: readonly ExecutionStatus[];
    cwd?: string;
    ownerSessionId?: string;
    createdBySessionId?: string;
    parentTurnId?: string;
    originToolCallIds?: readonly string[];
  } = {}): ExecutionRecord[] {
    const rows = this.db.prepare("SELECT * FROM executions ORDER BY created_at ASC").all() as ExecutionRow[];
    const cwd = input.cwd ? path.resolve(input.cwd) : undefined;
    const statuses = new Set(input.statuses ?? []);
    const originToolCallIds = new Set(input.originToolCallIds ?? []);
    return rows.map(fromExecutionRow)
      .filter((record) => statuses.size === 0 || statuses.has(record.status))
      .filter((record) => !input.ownerSessionId || record.ownerSessionId === input.ownerSessionId)
      .filter((record) => !input.createdBySessionId || record.createdBySessionId === input.createdBySessionId)
      .filter((record) => !input.parentTurnId || record.parentTurnId === input.parentTurnId)
      .filter((record) => originToolCallIds.size === 0 || originToolCallIds.has(record.originToolCallId))
      .filter((record) => !cwd || isSameOrDescendant(path.resolve(record.cwd), cwd) || isSameOrDescendant(cwd, path.resolve(record.cwd)));
  }

  markRunning(id: string, ownership: ExecutionOwnership, input: { pid: number; startedAt?: string; processIdentity?: Record<string, unknown> }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    assertController(current, ownership);
    if (isTerminalExecutionStatus(current.status)) return current;
    const now = new Date().toISOString();
    return this.save({
      ...current,
      status: "running",
      pid: input.pid,
      processIdentity: input.processIdentity ?? current.processIdentity,
      startedAt: input.startedAt ?? current.startedAt ?? now,
      deadlineAt: current.deadlineAt ?? buildDeadlineAt(input.startedAt ?? current.startedAt ?? now, current.timeoutMs),
      updatedAt: now,
    });
  }

  beginCancelling(id: string, ownership: ExecutionOwnership, input: { terminatedBy?: string; closeReason?: string } = {}): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    assertController(current, ownership);
    if (isTerminalExecutionStatus(current.status) || current.status === "cancelling") return current;
    return this.save({
      ...current,
      status: "cancelling",
      terminatedBy: input.terminatedBy ?? current.terminatedBy,
      closeReason: input.closeReason ?? current.closeReason ?? "cancelling",
      updatedAt: new Date().toISOString(),
    });
  }

  close(id: string, ownership: ExecutionOwnership, input: {
    status: Extract<ExecutionStatus, "completed" | "failed" | "aborted" | "lost">;
    exitCode?: number | null;
    output?: string;
    summary?: string;
    closeReason?: string;
    terminatedBy?: string;
    error?: string;
    finishedAt?: string;
  }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    assertController(current, ownership);
    if (isTerminalExecutionStatus(current.status)) return current;
    const now = new Date().toISOString();
    return this.save({
      ...current,
      status: input.status,
      exitCode: input.exitCode,
      output: input.output,
      summary: input.summary,
      closeReason: input.closeReason ?? current.closeReason ?? input.status,
      terminatedBy: input.terminatedBy ?? current.terminatedBy,
      error: input.error ?? current.error,
      updatedAt: now,
      finishedAt: input.finishedAt ?? now,
    });
  }

  save(record: ExecutionRecord): ExecutionRecord {
    const persisted = requireExecution(this.load(record.id), record.id);
    if (persisted.version !== record.version) {
      throw new Error(`Execution ${record.id} rejected a stale version ${record.version} transition.`);
    }
    if (!isAllowedExecutionTransition(persisted.status, record.status)) {
      throw new Error(`Execution ${record.id} rejected transition ${persisted.status} -> ${record.status}.`);
    }
    const next = { ...record, version: record.version + 1 };
    const result = this.db.prepare(`
      UPDATE executions SET
        status=@status, version=@nextVersion, command=@command, cwd=@cwd, requested_by=@requestedBy,
        owner_session_id=@ownerSessionId, created_by_session_id=@createdBySessionId,
        parent_turn_id=@parentTurnId, origin_tool_call_id=@originToolCallId,
        controller_token=@controllerToken, controller_generation=@controllerGeneration,
        controller_lease_expires_at=@controllerLeaseExpiresAt, controller_heartbeat_at=@controllerHeartbeatAt,
        pid=@pid, process_identity_json=@processIdentityJson,
        exit_code=@exitCode, output=@output, summary=@summary, deadline_at=@deadlineAt,
        last_output_at=@lastOutputAt, close_reason=@closeReason, terminated_by=@terminatedBy,
        error=@error, created_at=@createdAt, started_at=@startedAt, updated_at=@updatedAt,
        finished_at=@finishedAt, timeout_ms=@timeoutMs
      WHERE id=@id AND version=@version
        AND controller_token=@controllerToken AND controller_generation=@controllerGeneration
        AND controller_lease_expires_at > @now
    `).run({ ...toExecutionRow(record), nextVersion: next.version, now: new Date().toISOString() });
    if (result.changes !== 1) {
      throw new Error(`Execution ${record.id} rejected a stale version ${record.version} transition.`);
    }
    return next;
  }

  heartbeat(id: string, ownership: ExecutionOwnership, leaseMs = 30_000): ExecutionRecord {
    const now = new Date();
    const result = this.db.prepare(`
      UPDATE executions
      SET controller_heartbeat_at=@now, controller_lease_expires_at=@lease, updated_at=@now,
          version=version + 1
      WHERE id=@id AND controller_token=@controllerToken AND controller_generation=@controllerGeneration
        AND status IN ('created', 'running', 'cancelling')
        AND controller_lease_expires_at > @now
    `).run({ ...ownership, id, now: now.toISOString(), lease: new Date(now.getTime() + leaseMs).toISOString() });
    if (result.changes !== 1) throw new Error(`Execution ${id} no longer owns its controller lease.`);
    return this.load(id)!;
  }

  claimRecovery(id: string, now = new Date()): ExecutionRecord | undefined {
    const token = crypto.randomUUID();
    const nowIso = now.toISOString();
    const result = this.db.prepare(`
      UPDATE executions
      SET controller_token=@token, controller_generation=controller_generation + 1,
          controller_heartbeat_at=@now, controller_lease_expires_at=@lease, updated_at=@now,
          version=version + 1
      WHERE id=@id AND status IN ('created', 'running', 'cancelling')
        AND controller_lease_expires_at <= @now
    `).run({ id, token, now: nowIso, lease: new Date(now.getTime() + 30_000).toISOString() });
    return result.changes === 1 ? this.load(id) : undefined;
  }

  claimCancellation(id: string, ownerSessionId?: string): ExecutionRecord | undefined {
    const token = crypto.randomUUID();
    const now = new Date();
    const result = this.db.prepare(`
      UPDATE executions
      SET status='cancelling', controller_token=@token,
          controller_generation=controller_generation + 1,
          controller_heartbeat_at=@now, controller_lease_expires_at=@lease,
          close_reason='termination_requested', updated_at=@now, version=version + 1
      WHERE id=@id AND status IN ('created', 'running', 'cancelling')
        AND (@ownerSessionId IS NULL OR owner_session_id=@ownerSessionId)
    `).run({
      id,
      ownerSessionId: ownerSessionId ?? null,
      token,
      now: now.toISOString(),
      lease: new Date(now.getTime() + 30_000).toISOString(),
    });
    return result.changes === 1 ? this.load(id) : undefined;
  }
}

function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "aborted" || status === "lost";
}

function isAllowedExecutionTransition(from: ExecutionStatus, to: ExecutionStatus): boolean {
  if (isTerminalExecutionStatus(from)) return false;
  if (from === to) return true;
  if (from === "created") {
    return to === "running" || to === "cancelling" || isTerminalExecutionStatus(to);
  }
  if (from === "running") return to === "cancelling" || isTerminalExecutionStatus(to);
  if (from === "cancelling") return isTerminalExecutionStatus(to);
  return false;
}

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) throw unknownExecution(id);
  return record;
}

function assertController(record: ExecutionRecord, ownership: ExecutionOwnership): void {
  if (record.controllerToken !== ownership.controllerToken || record.controllerGeneration !== ownership.controllerGeneration) {
    throw new Error(`Execution ${record.id} rejected a stale controller generation.`);
  }
}

function isSameOrDescendant(targetPath: string, possibleAncestor: string): boolean {
  const relative = path.relative(possibleAncestor, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
