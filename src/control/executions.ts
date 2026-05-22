import type Database from "better-sqlite3";
import path from "node:path";

import type { ExecutionKind } from "../execution/kinds.js";
import { createLeadWaitPolicy, normalizeLeadWaitPolicy, type LeadWaitPolicy, type LeadWaitPolicyInput } from "../protocol/leadWait.js";
import { createControlPlaneId } from "./shared.js";
import type { ExecutionRecord, ExecutionStatus } from "./types.js";

interface ExecutionRow {
  id: string;
  kind: string;
  status: string;
  command: string | null;
  prompt: string | null;
  actor_name: string | null;
  actor_role: string | null;
  cwd: string;
  requested_by: string;
  session_id: string | null;
  pid: number | null;
  exit_code: number | null;
  output: string | null;
  summary: string | null;
  wait_policy_json: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  timeout_ms: number | null;
}

export class ExecutionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    id?: string;
    kind: ExecutionKind;
    status?: Extract<ExecutionStatus, "created" | "running">;
    command?: string;
    prompt?: string;
    actorName?: string;
    actorRole?: string;
    cwd: string;
    requestedBy: string;
    sessionId?: string;
    pid?: number;
    timeoutMs?: number;
    waitPolicy?: LeadWaitPolicyInput;
  }): ExecutionRecord {
    const now = new Date().toISOString();
    const record: ExecutionRecord = {
      id: input.id ?? createControlPlaneId("exec"),
      kind: input.kind,
      status: input.status ?? "created",
      command: input.command,
      prompt: input.prompt,
      actorName: input.actorName,
      actorRole: input.actorRole,
      cwd: path.resolve(input.cwd),
      requestedBy: input.requestedBy,
      sessionId: input.sessionId,
      pid: input.pid,
      waitPolicy: normalizeExecutionWaitPolicy(input.kind, input.waitPolicy),
      createdAt: now,
      startedAt: input.status === "running" ? now : undefined,
      updatedAt: now,
      timeoutMs: input.timeoutMs,
    };
    this.db.prepare(`
      INSERT INTO executions (
        id, kind, status, command, prompt, actor_name, actor_role, cwd, requested_by, session_id, pid, exit_code,
        output, summary, wait_policy_json, created_at, started_at, updated_at, finished_at, timeout_ms
      ) VALUES (
        @id, @kind, @status, @command, @prompt, @actorName, @actorRole, @cwd, @requestedBy, @sessionId, @pid, @exitCode,
        @output, @summary, @waitPolicyJson, @createdAt, @startedAt, @updatedAt, @finishedAt, @timeoutMs
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
      updatedAt: now,
    });
  }

  close(id: string, input: {
    status: Extract<ExecutionStatus, "completed" | "failed" | "aborted" | "stale" | "paused">;
    exitCode?: number | null;
    output?: string;
    summary?: string;
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
      updatedAt: now,
      finishedAt: input.finishedAt ?? now,
    });
  }

  save(record: ExecutionRecord): ExecutionRecord {
    this.db.prepare(`
      UPDATE executions SET
        kind=@kind,
        status=@status,
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

function toExecutionRow(record: ExecutionRecord): Record<string, unknown> {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    command: record.command,
    prompt: record.prompt,
    actorName: record.actorName,
    actorRole: record.actorRole,
    cwd: record.cwd,
    requestedBy: record.requestedBy,
    sessionId: record.sessionId,
    pid: record.pid,
    exitCode: record.exitCode,
    output: record.output,
    summary: record.summary,
    waitPolicyJson: record.waitPolicy ? JSON.stringify(record.waitPolicy) : null,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    finishedAt: record.finishedAt,
    timeoutMs: record.timeoutMs,
  };
}

function fromExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    kind: row.kind as ExecutionKind,
    status: row.status as ExecutionStatus,
    command: row.command ?? undefined,
    prompt: row.prompt ?? undefined,
    actorName: row.actor_name ?? undefined,
    actorRole: row.actor_role ?? undefined,
    cwd: row.cwd,
    requestedBy: row.requested_by,
    sessionId: row.session_id ?? undefined,
    pid: row.pid ?? undefined,
    exitCode: row.exit_code,
    output: row.output ?? undefined,
    summary: row.summary ?? undefined,
    waitPolicy: readWaitPolicy(row.wait_policy_json, row.kind as ExecutionKind),
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
  };
}

function normalizeExecutionWaitPolicy(kind: ExecutionKind, value?: LeadWaitPolicyInput): LeadWaitPolicy {
  if (value) {
    return normalizeLeadWaitPolicy(value);
  }

  return kind === "subagent" || kind === "team"
    ? createLeadWaitPolicy({
        lead: "while_execution_active",
        wake: "required",
        scope: "objective",
      })
    : createLeadWaitPolicy({
        lead: "none",
        wake: "optional",
        scope: "objective",
      });
}

function readWaitPolicy(value: string | null, kind: ExecutionKind): LeadWaitPolicy {
  if (!value) {
    return normalizeExecutionWaitPolicy(kind);
  }

  try {
    return normalizeLeadWaitPolicy(JSON.parse(value));
  } catch {
    return normalizeExecutionWaitPolicy(kind);
  }
}

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) {
    throw new Error(`Unknown execution: ${id}`);
  }
  return record;
}

function isSameOrDescendant(targetPath: string, possibleAncestor: string): boolean {
  const relative = path.relative(possibleAncestor, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

