import type { ExecutionRecord } from "../control/ledger.js";
import type { RuntimeExecutionHealth } from "./statusTypes.js";

export function isActiveExecution(execution: ExecutionRecord): boolean {
  return execution.status === "created" || execution.status === "running";
}

export function summarizeExecutionHealth(execution: ExecutionRecord): RuntimeExecutionHealth {
  if (execution.status === "lost") {
    return {
      state: "lost",
      message: "Execution process disappeared before a normal closeout.",
    };
  }
  if (!isActiveExecution(execution)) {
    return {
      state: "settled",
      message: `Execution finished with status ${execution.status}.`,
    };
  }
  if (execution.kind === "background" && execution.status === "running" && !execution.output && !execution.summary) {
    return {
      state: "no_output",
      message: "Background execution is running but has not published output yet.",
    };
  }
  const deadlineAt = getExecutionDeadlineAt(execution);
  if (deadlineAt && Date.parse(deadlineAt) <= Date.now()) {
    return {
      state: "deadline_passed",
      message: `Execution deadline passed at ${deadlineAt}.`,
    };
  }
  return {
    state: "running",
    message: `Execution is ${execution.status}.`,
  };
}

export function getExecutionDeadlineAt(execution: ExecutionRecord): string | undefined {
  if (typeof execution.timeoutMs !== "number" || execution.timeoutMs <= 0) {
    return undefined;
  }
  const base = Date.parse(execution.startedAt ?? execution.createdAt);
  if (!Number.isFinite(base)) {
    return undefined;
  }
  return new Date(base + execution.timeoutMs).toISOString();
}
