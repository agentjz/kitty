import type { ExecutionRecord } from "../control/ledger.js";
import { getExecutionDeadlineAt, isActiveExecution, summarizeExecutionHealth } from "./executionHealth.js";
import type { RuntimeExecutionSummary } from "./statusTypes.js";

export function summarizeExecution(execution: ExecutionRecord): RuntimeExecutionSummary {
  return {
    id: execution.id,
    kind: execution.kind,
    status: execution.status,
    requestedBy: execution.requestedBy,
    pid: execution.pid,
    command: execution.command,
    cwd: execution.cwd,
    summary: execution.summary,
    outputPreview: execution.output ? truncateExecutionOutput(execution.output) : undefined,
    health: summarizeExecutionHealth(execution),
    deadlineAt: getExecutionDeadlineAt(execution),
    lastOutputAt: execution.lastOutputAt,
    closeReason: execution.closeReason,
    terminatedBy: execution.terminatedBy,
    error: execution.error,
    updatedAt: execution.updatedAt,
  };
}

export function summarizeExecutionSet(executions: readonly ExecutionRecord[], options: {
  recentLimit?: number;
} = {}): {
  total: number;
  active: RuntimeExecutionSummary[];
  recent: RuntimeExecutionSummary[];
} {
  const recentLimit = options.recentLimit ?? 10;
  const summaries = executions
    .map(summarizeExecution)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  return {
    total: executions.length,
    active: executions.filter(isActiveExecution).map(summarizeExecution),
    recent: summaries.slice(0, recentLimit),
  };
}

function truncateExecutionOutput(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 240)}...`;
}
