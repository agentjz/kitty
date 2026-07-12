import { reconcileBackgroundExecutions, terminateBackgroundExecution } from "./background.js";
import { isProcessAlive, isSameProcess, terminatePid, type ProcessIdentity } from "./process.js";
import { ExecutionStore, type ExecutionRecord } from "./store.js";
import { unknownExecution } from "./errors.js";
import { executionOwnership } from "../control/types.js";
import { ControlPlaneLedger } from "../control/ledger.js";

export interface RunningExecutionProcess {
  kind: "foreground" | "background";
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
  return new ExecutionStore(rootDir).list({ statuses: ["running", "cancelling"], ownerSessionId })
    .filter((execution) => typeof execution.pid === "number" && execution.pid > 0)
    .map((execution) => ({
      kind: execution.kind,
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
  for (const execution of store.list({
    statuses: ["created", "running", "cancelling"],
    ownerSessionId: input.ownerSessionId,
  })) {
    const identity = execution.processIdentity as ProcessIdentity | undefined;
    if (identity && !isSameProcess(identity)) {
      const claimed = claimExecutionReconciliation(rootDir, execution.id);
      if (!claimed) continue;
      lostExecutions.push(store.close(execution.id, executionOwnership(claimed), {
        status: "lost",
        output: execution.output,
        summary: `Process identity changed before completion: pid=${execution.pid}`,
        closeReason: "process_identity_changed",
      }));
      continue;
    }
    const claimed = claimExecutionReconciliation(rootDir, execution.id);
    if (!claimed) continue;
    if (typeof execution.pid === "number" && isProcessAlive(execution.pid)) {
      try { terminatePid(execution.pid, identity); }
      catch { /* recovered generation below still records the lost controller */ }
    }
    lostExecutions.push(store.close(execution.id, executionOwnership(claimed), {
      status: "lost",
      output: execution.output,
      summary: typeof execution.pid === "number"
        ? `Execution controller lease expired before completion: pid=${execution.pid}`
        : "Execution controller lease expired before process registration.",
      closeReason: typeof execution.pid === "number" ? "controller_lease_expired" : "launch_unconfirmed",
    }));
  }
  return { lostExecutions };
}

function claimExecutionReconciliation(rootDir: string, id: string): ExecutionRecord | undefined {
  const ledger = new ControlPlaneLedger(rootDir);
  try { return ledger.executions.claimRecovery(id); }
  finally { ledger.close(); }
}

export function isSettled(execution: ExecutionRecord): boolean {
  return execution.status === "completed" || execution.status === "failed" ||
    execution.status === "aborted" || execution.status === "lost";
}
