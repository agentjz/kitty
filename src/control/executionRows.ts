import type { ExecutionRecord, ExecutionStatus } from "./types.js";

export interface ExecutionRow {
  id: string;
  kind: string;
  status: string;
  command: string;
  cwd: string;
  requested_by: string;
  owner_session_id: string;
  created_by_session_id: string;
  parent_turn_id: string;
  origin_tool_call_id: string;
  pid: number | null;
  exit_code: number | null;
  output: string | null;
  summary: string | null;
  deadline_at: string | null;
  last_output_at: string | null;
  close_reason: string | null;
  terminated_by: string | null;
  error: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  timeout_ms: number | null;
}

export function toExecutionRow(record: ExecutionRecord): Record<string, unknown> {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    command: record.command,
    cwd: record.cwd,
    requestedBy: record.requestedBy,
    ownerSessionId: record.ownerSessionId,
    createdBySessionId: record.createdBySessionId,
    parentTurnId: record.parentTurnId,
    originToolCallId: record.originToolCallId,
    pid: record.pid,
    exitCode: record.exitCode,
    output: record.output,
    summary: record.summary,
    deadlineAt: record.deadlineAt,
    lastOutputAt: record.lastOutputAt,
    closeReason: record.closeReason,
    terminatedBy: record.terminatedBy,
    error: record.error,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    finishedAt: record.finishedAt,
    timeoutMs: record.timeoutMs,
  };
}

export function fromExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    kind: "background",
    status: row.status as ExecutionStatus,
    command: row.command,
    cwd: row.cwd,
    requestedBy: row.requested_by,
    ownerSessionId: row.owner_session_id,
    createdBySessionId: row.created_by_session_id,
    parentTurnId: row.parent_turn_id,
    originToolCallId: row.origin_tool_call_id,
    pid: row.pid ?? undefined,
    exitCode: row.exit_code,
    output: row.output ?? undefined,
    summary: row.summary ?? undefined,
    deadlineAt: row.deadline_at ?? undefined,
    lastOutputAt: row.last_output_at ?? undefined,
    closeReason: row.close_reason ?? undefined,
    terminatedBy: row.terminated_by ?? undefined,
    error: row.error ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
  };
}

export function buildDeadlineAt(baseTimestamp: string, timeoutMs: number | undefined): string | undefined {
  if (typeof timeoutMs !== "number" || timeoutMs <= 0) return undefined;
  const base = Date.parse(baseTimestamp);
  return Number.isFinite(base) ? new Date(base + timeoutMs).toISOString() : undefined;
}
