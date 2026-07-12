import type Database from "better-sqlite3";
import path from "node:path";

import { unknownExecution } from "../execution/errors.js";
import { buildDeadlineAt, fromExecutionRow, toExecutionRow, type ExecutionRow } from "./executionRows.js";
import { createControlPlaneId } from "./shared.js";
import type { ExecutionRecord, ExecutionStatus } from "./types.js";

export class ExecutionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    id?: string;
    status?: Extract<ExecutionStatus, "created" | "running">;
    command: string;
    cwd: string;
    requestedBy: string;
    ownerSessionId: string;
    createdBySessionId: string;
    parentTurnId: string;
    originToolCallId: string;
    pid?: number;
    timeoutMs?: number;
    deadlineAt?: string;
  }): ExecutionRecord {
    const now = new Date().toISOString();
    const record: ExecutionRecord = {
      id: input.id ?? createControlPlaneId("exec"),
      kind: "background",
      status: input.status ?? "created",
      command: input.command,
      cwd: path.resolve(input.cwd),
      requestedBy: input.requestedBy,
      ownerSessionId: input.ownerSessionId,
      createdBySessionId: input.createdBySessionId,
      parentTurnId: input.parentTurnId,
      originToolCallId: input.originToolCallId,
      pid: input.pid,
      deadlineAt: input.deadlineAt ?? buildDeadlineAt(now, input.timeoutMs),
      createdAt: now,
      startedAt: input.status === "running" ? now : undefined,
      updatedAt: now,
      timeoutMs: input.timeoutMs,
    };
    this.db.prepare(`
      INSERT INTO executions (
        id, kind, status, command, cwd, requested_by, owner_session_id, created_by_session_id,
        parent_turn_id, origin_tool_call_id, pid, exit_code, output, summary, deadline_at,
        last_output_at, close_reason, terminated_by, error, created_at, started_at, updated_at,
        finished_at, timeout_ms
      ) VALUES (
        @id, @kind, @status, @command, @cwd, @requestedBy, @ownerSessionId, @createdBySessionId,
        @parentTurnId, @originToolCallId, @pid, @exitCode, @output, @summary, @deadlineAt,
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

  markRunning(id: string, input: { pid: number; startedAt?: string }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    if (isTerminalExecutionStatus(current.status)) return current;
    const now = new Date().toISOString();
    return this.save({
      ...current,
      status: "running",
      pid: input.pid,
      startedAt: input.startedAt ?? current.startedAt ?? now,
      deadlineAt: current.deadlineAt ?? buildDeadlineAt(input.startedAt ?? current.startedAt ?? now, current.timeoutMs),
      updatedAt: now,
    });
  }

  close(id: string, input: {
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
    this.db.prepare(`
      UPDATE executions SET
        status=@status, command=@command, cwd=@cwd, requested_by=@requestedBy,
        owner_session_id=@ownerSessionId, created_by_session_id=@createdBySessionId,
        parent_turn_id=@parentTurnId, origin_tool_call_id=@originToolCallId, pid=@pid,
        exit_code=@exitCode, output=@output, summary=@summary, deadline_at=@deadlineAt,
        last_output_at=@lastOutputAt, close_reason=@closeReason, terminated_by=@terminatedBy,
        error=@error, created_at=@createdAt, started_at=@startedAt, updated_at=@updatedAt,
        finished_at=@finishedAt, timeout_ms=@timeoutMs
      WHERE id=@id
    `).run(toExecutionRow(record));
    return record;
  }
}

function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "aborted" || status === "lost";
}

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) throw unknownExecution(id);
  return record;
}

function isSameOrDescendant(targetPath: string, possibleAncestor: string): boolean {
  const relative = path.relative(possibleAncestor, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
