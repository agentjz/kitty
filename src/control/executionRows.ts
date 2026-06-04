import type { ExecutionKind } from "../execution/kinds.js";
import { createLeadWaitPolicy, normalizeLeadWaitPolicy, type LeadWaitPolicy, type LeadWaitPolicyInput } from "../protocol/leadWait.js";
import type { ExecutionRecord, ExecutionStatus } from "./types.js";

export interface ExecutionRow {
  id: string;
  kind: string;
  status: string;
  assignment_json: string | null;
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
  deadline_at: string | null;
  last_output_at: string | null;
  close_reason: string | null;
  terminated_by: string | null;
  changed_paths_json: string | null;
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
    assignmentJson: record.assignment ? JSON.stringify(record.assignment) : null,
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
    deadlineAt: record.deadlineAt,
    lastOutputAt: record.lastOutputAt,
    closeReason: record.closeReason,
    terminatedBy: record.terminatedBy,
    changedPathsJson: JSON.stringify(normalizeStringList(record.changedPaths)),
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
    kind: row.kind as ExecutionKind,
    status: row.status as ExecutionStatus,
    assignment: readAssignment(row.assignment_json),
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
    deadlineAt: row.deadline_at ?? undefined,
    lastOutputAt: row.last_output_at ?? undefined,
    closeReason: row.close_reason ?? undefined,
    terminatedBy: row.terminated_by ?? undefined,
    changedPaths: readStringList(row.changed_paths_json),
    error: row.error ?? undefined,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
  };
}

export function normalizeExecutionAssignment(value: ExecutionRecord["assignment"]): ExecutionRecord["assignment"] {
  if (!value) {
    return undefined;
  }

  const assignment = {
    objective: normalizeAssignmentField(value.objective),
    boundary: normalizeAssignmentField(value.boundary),
    expectedOutput: normalizeAssignmentField(value.expectedOutput),
  };
  return assignment.objective || assignment.boundary || assignment.expectedOutput ? assignment : undefined;
}

export function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of value) {
    const text = typeof item === "string" ? item.trim() : "";
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    result.push(text);
  }
  return result;
}

export function buildDeadlineAt(baseTimestamp: string, timeoutMs: number | undefined): string | undefined {
  if (typeof timeoutMs !== "number" || timeoutMs <= 0) {
    return undefined;
  }
  const base = Date.parse(baseTimestamp);
  return Number.isFinite(base) ? new Date(base + timeoutMs).toISOString() : undefined;
}

export function normalizeExecutionWaitPolicy(kind: ExecutionKind, value?: LeadWaitPolicyInput): LeadWaitPolicy {
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

function readAssignment(value: string | null): ExecutionRecord["assignment"] {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as ExecutionRecord["assignment"];
    return normalizeExecutionAssignment(parsed);
  } catch {
    return undefined;
  }
}

function normalizeAssignmentField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringList(value: string | null): string[] {
  if (!value) {
    return [];
  }
  try {
    return normalizeStringList(JSON.parse(value));
  } catch {
    return [];
  }
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
