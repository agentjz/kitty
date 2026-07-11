import type Database from "better-sqlite3";
import path from "node:path";

import { unknownExecution } from "../execution/errors.js";
import type { ExecutionKind } from "../execution/kinds.js";
import type { LeadWaitPolicyInput } from "../execution/leadWaitPolicy.js";
import {
  buildDeadlineAt,
  fromExecutionRow,
  normalizeExecutionAssignment,
  normalizeExecutionWaitPolicy,
  normalizeStringList,
  toExecutionRow,
  type ExecutionRow,
} from "./executionRows.js";
import { createControlPlaneId } from "./shared.js";
import type { ExecutionRecord, ExecutionStatus } from "./types.js";

export class ExecutionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    id?: string;
    kind: ExecutionKind;
    status?: Extract<ExecutionStatus, "created" | "running">;
    command?: string;
    prompt?: string;
    assignment?: ExecutionRecord["assignment"];
    actorName?: string;
    actorRole?: string;
    cwd: string;
    requestedBy: string;
    sessionId?: string;
    pid?: number;
    timeoutMs?: number;
    waitPolicy?: LeadWaitPolicyInput;
    deadlineAt?: string;
  }): ExecutionRecord {
    const now = new Date().toISOString();
    const record: ExecutionRecord = {
      id: input.id ?? createControlPlaneId("exec"),
      kind: input.kind,
      status: input.status ?? "created",
      assignment: normalizeExecutionAssignment(input.assignment),
      command: input.command,
      prompt: input.prompt,
      actorName: input.actorName,
      actorRole: input.actorRole,
      cwd: path.resolve(input.cwd),
      requestedBy: input.requestedBy,
      sessionId: input.sessionId,
      pid: input.pid,
      waitPolicy: normalizeExecutionWaitPolicy(input.kind, input.waitPolicy),
      deadlineAt: input.deadlineAt ?? buildDeadlineAt(now, input.timeoutMs),
      changedPaths: [],
      createdAt: now,
      startedAt: input.status === "running" ? now : undefined,
      updatedAt: now,
      timeoutMs: input.timeoutMs,
    };
    this.db.prepare(`
      INSERT INTO executions (
        id, kind, status, assignment_json, command, prompt, actor_name, actor_role, cwd, requested_by, session_id, pid, exit_code,
        output, summary, wait_policy_json, deadline_at, last_output_at, close_reason, terminated_by, changed_paths_json, error,
        created_at, started_at, updated_at, finished_at, timeout_ms
      ) VALUES (
        @id, @kind, @status, @assignmentJson, @command, @prompt, @actorName, @actorRole, @cwd, @requestedBy, @sessionId, @pid, @exitCode,
        @output, @summary, @waitPolicyJson, @deadlineAt, @lastOutputAt, @closeReason, @terminatedBy, @changedPathsJson, @error,
        @createdAt, @startedAt, @updatedAt, @finishedAt, @timeoutMs
      )
    `).run(toExecutionRow(record));
    return record;
  }

  load(id: string): ExecutionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM executions WHERE id = ?").get(id);
    return row ? fromExecutionRow(row as ExecutionRow) : undefined;
  }

  list(input: {
    kind?: ExecutionKind;
    kinds?: readonly ExecutionKind[];
    statuses?: readonly ExecutionStatus[];
    cwd?: string;
  } = {}): ExecutionRecord[] {
    const rows = this.db.prepare("SELECT * FROM executions ORDER BY created_at ASC").all() as ExecutionRow[];
    const cwd = input.cwd ? path.resolve(input.cwd) : undefined;
    const statuses = new Set(input.statuses ?? []);
    const kinds = new Set(input.kinds ?? []);
    return rows
      .map(fromExecutionRow)
      .filter((record) => !input.kind || record.kind === input.kind)
      .filter((record) => kinds.size === 0 || kinds.has(record.kind))
      .filter((record) => statuses.size === 0 || statuses.has(record.status))
      .filter((record) => !cwd || isSameOrDescendant(path.resolve(record.cwd), cwd) || isSameOrDescendant(cwd, path.resolve(record.cwd)));
  }

  markRunning(id: string, input: { pid: number; startedAt?: string }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
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
    status: Extract<ExecutionStatus, "completed" | "failed" | "aborted" | "stale" | "paused">;
    exitCode?: number | null;
    output?: string;
    summary?: string;
    closeReason?: string;
    terminatedBy?: string;
    changedPaths?: readonly string[];
    error?: string;
    finishedAt?: string;
  }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    if (isTerminalExecutionStatus(current.status)) {
      return current;
    }
    const now = new Date().toISOString();
    return this.save({
      ...current,
      status: input.status,
      exitCode: input.exitCode,
      output: input.output,
      summary: input.summary,
      closeReason: input.closeReason ?? current.closeReason ?? input.status,
      terminatedBy: input.terminatedBy ?? current.terminatedBy,
      changedPaths: normalizeStringList(input.changedPaths ?? current.changedPaths),
      error: input.error ?? current.error,
      updatedAt: now,
      finishedAt: input.finishedAt ?? now,
    });
  }

  save(record: ExecutionRecord): ExecutionRecord {
    this.db.prepare(`
      UPDATE executions SET
        kind=@kind,
        status=@status,
        assignment_json=@assignmentJson,
        command=@command,
        prompt=@prompt,
        actor_name=@actorName,
        actor_role=@actorRole,
        cwd=@cwd,
        requested_by=@requestedBy,
        session_id=@sessionId,
        pid=@pid,
        exit_code=@exitCode,
        output=@output,
        summary=@summary,
        wait_policy_json=@waitPolicyJson,
        deadline_at=@deadlineAt,
        last_output_at=@lastOutputAt,
        close_reason=@closeReason,
        terminated_by=@terminatedBy,
        changed_paths_json=@changedPathsJson,
        error=@error,
        created_at=@createdAt,
        started_at=@startedAt,
        updated_at=@updatedAt,
        finished_at=@finishedAt,
        timeout_ms=@timeoutMs
      WHERE id=@id
    `).run(toExecutionRow(record));
    return record;
  }
}

function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "aborted" || status === "stale";
}

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) {
    throw unknownExecution(id);
  }
  return record;
}

function isSameOrDescendant(targetPath: string, possibleAncestor: string): boolean {
  const relative = path.relative(possibleAncestor, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
