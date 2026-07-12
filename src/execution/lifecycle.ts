import { reconcileBackgroundExecutions, terminateBackgroundExecution } from "./background.js";
import { isProcessAlive } from "./process.js";
import { ExecutionStore, type ExecutionRecord } from "./store.js";
import { unknownExecution } from "./errors.js";

export interface RunningExecutionProcess {
  kind: "background";
  id: string;
  pid: number;
  summary: string;
}

export interface TerminationResult {
  terminatedPids: number[];
  failedPids: number[];
}

export function collectRunningExecutionProcesses(rootDir: string, ownerSessionId: string): RunningExecutionProcess[] {
  reconcileExecutions(rootDir, { ownerSessionId });
  return new ExecutionStore(rootDir).list({ statuses: ["running"], ownerSessionId })
    .filter((execution) => typeof execution.pid === "number" && execution.pid > 0)
    .map((execution) => ({
      kind: "background",
      id: execution.id,
      pid: execution.pid!,
      summary: `background ${execution.id} pid=${execution.pid} ${execution.command}`,
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
      terminateBackgroundExecution(rootDir, processInfo.id);
      terminatedPids.push(processInfo.pid);
    } catch {
      failedPids.push(processInfo.pid);
    }
  }
  return { terminatedPids, failedPids };
}

export function cancelExecution(rootDir: string, id: string, input: {
  ownerSessionId?: string;
  terminatedBy?: string;
  summary?: string;
} = {}): ExecutionRecord {
  const store = new ExecutionStore(rootDir);
  const execution = input.ownerSessionId ? store.loadOwned(id, input.ownerSessionId) : store.load(id);
  if (!execution) throw unknownExecution(id);
  if (isSettled(execution)) return execution;
  return terminateBackgroundExecution(rootDir, id, input.ownerSessionId);
}

export function reconcileExecutions(rootDir: string, input: {
  ownerSessionId?: string;
} = {}): { lostExecutions: ExecutionRecord[] } {
  const store = new ExecutionStore(rootDir);
  const lostExecutions: ExecutionRecord[] = [];
  for (const execution of store.list({ statuses: ["running"], ownerSessionId: input.ownerSessionId })) {
    if (typeof execution.pid !== "number" || isProcessAlive(execution.pid)) continue;
    lostExecutions.push(store.close(execution.id, {
      status: "lost",
      output: execution.output,
      summary: `Background process disappeared before reporting completion: pid=${execution.pid}`,
      closeReason: "process_disappeared",
    }));
  }
  return { lostExecutions };
}

export function isSettled(execution: ExecutionRecord): boolean {
  return execution.status === "completed" || execution.status === "failed" ||
    execution.status === "aborted" || execution.status === "lost";
}
