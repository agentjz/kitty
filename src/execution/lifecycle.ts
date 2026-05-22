import { reconcileBackgroundExecutions, terminateBackgroundExecution } from "./background.js";
import { EXECUTION_KINDS } from "./kinds.js";
import { isProcessAlive, terminatePid } from "./process.js";
import { ExecutionStore, type ExecutionKind } from "./store.js";

export interface RunningExecutionProcess {
  kind: ExecutionKind;
  id: string;
  pid: number;
  summary: string;
}

export interface TerminationResult {
  terminatedPids: number[];
  failedPids: number[];
}

export function collectRunningExecutionProcesses(rootDir: string, cwd: string): RunningExecutionProcess[] {
  reconcileRunningExecutions(rootDir);
  return new ExecutionStore(rootDir)
    .list({ kinds: EXECUTION_KINDS, statuses: ["running"], cwd })
    .filter((execution) => typeof execution.pid === "number" && execution.pid > 0)
    .map((execution) => ({
      kind: execution.kind,
      id: execution.id,
      pid: execution.pid as number,
      summary: formatRunningExecutionSummary(execution),
    }));
}

export function terminateRunningExecutionProcesses(
  rootDir: string,
  processes: readonly RunningExecutionProcess[],
): TerminationResult {
  const terminatedPids: number[] = [];
  const failedPids: number[] = [];
  for (const processInfo of processes) {
    try {
      terminateRunningExecution(rootDir, processInfo);
      terminatedPids.push(processInfo.pid);
    } catch {
      failedPids.push(processInfo.pid);
    }
  }
  return { terminatedPids, failedPids };
}

function reconcileRunningExecutions(rootDir: string): void {
  reconcileBackgroundExecutions(rootDir);
  const store = new ExecutionStore(rootDir);
  for (const execution of store.list({ kinds: EXECUTION_KINDS, statuses: ["running"] })) {
    if (typeof execution.pid !== "number" || isProcessAlive(execution.pid)) {
      continue;
    }
    store.close(execution.id, {
      status: "stale",
      summary: `${execution.kind} process disappeared before reporting completion: pid=${execution.pid}`,
    });
  }
}

function terminateRunningExecution(rootDir: string, processInfo: RunningExecutionProcess): void {
  if (processInfo.kind === "background") {
    terminateBackgroundExecution(rootDir, processInfo.id);
    return;
  }
  terminatePid(processInfo.pid);
  new ExecutionStore(rootDir).close(processInfo.id, {
    status: "aborted",
    summary: `${processInfo.kind} execution terminated by host lifecycle.`,
  });
}

function formatRunningExecutionSummary(execution: {
  kind: ExecutionKind;
  id: string;
  pid?: number;
  command?: string;
  actorName?: string;
}): string {
  const subject = execution.kind === "background" ? execution.command : execution.actorName;
  return `${execution.kind} ${execution.id} pid=${execution.pid ?? ""} ${subject ?? ""}`.trim();
}
