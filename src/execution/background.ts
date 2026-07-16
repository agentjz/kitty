import { ControlPlaneLedger, type ExecutionRecord, type WakeSignalReason } from "../control/ledger.js";
import { executionOwnership, type ExecutionOwnership } from "../control/types.js";
import { inspectProcessIdentity, isProcessAlive, isSameProcess, terminatePid, type ProcessIdentity } from "./process.js";
import { unknownExecution } from "./errors.js";
import { watchProcessUntilParentExit } from "./parentDeathWatchdog.js";
import { notifyBackgroundExecutionChange } from "./backgroundSignals.js";

interface BackgroundProcessHandle {
  kill?: (signal?: NodeJS.Signals | number, error?: Error) => unknown;
  then: Promise<unknown>["then"];
}

const activeBackgroundProcesses = new Map<string, {
  kill: () => void;
  settled: Promise<void>;
}>();

export class BackgroundExecutionStore {
  constructor(private readonly rootDir: string) {}

  create(input: {
    command: string;
    cwd: string;
    requestedBy: string;
    ownerSessionId: string;
    createdBySessionId: string;
    parentTurnId: string;
    originToolCallId: string;
    timeoutMs?: number;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const execution = ledger.executions.create({
        status: "created",
        command: input.command,
        cwd: input.cwd,
        requestedBy: input.requestedBy,
        ownerSessionId: input.ownerSessionId,
        createdBySessionId: input.createdBySessionId,
        parentTurnId: input.parentTurnId,
        originToolCallId: input.originToolCallId,
        timeoutMs: input.timeoutMs,
      });
      notifyBackgroundExecutionChange(this.rootDir, execution.id);
      return execution;
    } finally {
      ledger.close();
    }
  }

  load(id: string, ownerSessionId?: string): ExecutionRecord | undefined {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ownerSessionId ? ledger.executions.loadOwned(id, ownerSessionId) : ledger.executions.load(id);
    } finally {
      ledger.close();
    }
  }

  listRunning(input: { cwd?: string; ownerSessionId?: string } = {}): ExecutionRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.list({
        statuses: ["running"],
        cwd: input.cwd,
        ownerSessionId: input.ownerSessionId,
      }).filter((execution) => execution.kind === "background");
    } finally {
      ledger.close();
    }
  }

  listAll(ownerSessionId?: string): ExecutionRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.list({ ownerSessionId })
        .filter((execution) => execution.kind === "background");
    } finally {
      ledger.close();
    }
  }

  markRunning(id: string, ownership: ExecutionOwnership, input: { pid: number; processIdentity?: ProcessIdentity }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const execution = ledger.executions.markRunning(id, ownership, {
        ...input,
        processIdentity: input.processIdentity ?? inspectProcessIdentity(input.pid),
      });
      notifyBackgroundExecutionChange(this.rootDir, id);
      return execution;
    } finally {
      ledger.close();
    }
  }

  heartbeat(id: string, ownership: ExecutionOwnership): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.executions.heartbeat(id, ownership); }
    finally { ledger.close(); }
  }

  updateRunningOutput(id: string, ownership: ExecutionOwnership, input: {
    output?: string;
    summary?: string;
    lastOutputAt?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const execution = ledger.executions.load(id);
      if (!execution) {
        throw unknownExecution(id);
      }
      if (execution.controllerToken !== ownership.controllerToken || execution.controllerGeneration !== ownership.controllerGeneration) {
        throw new Error(`Execution ${id} rejected stale output from a previous controller.`);
      }
      if (execution.status !== "running") {
        return execution;
      }
      const updated = ledger.executions.save({
        ...execution,
        output: input.output ?? execution.output,
        summary: input.summary ?? execution.summary,
        lastOutputAt: input.lastOutputAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      notifyBackgroundExecutionChange(this.rootDir, id);
      return updated;
    } finally {
      ledger.close();
    }
  }

  close(id: string, ownership: ExecutionOwnership, input: {
    status: "completed" | "failed" | "aborted" | "lost";
    exitCode?: number | null;
    output?: string;
    summary?: string;
    closeReason?: string;
    terminatedBy?: string;
    error?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const closed = ledger.transaction(() => {
        const closed = ledger.executions.close(id, ownership, input);
        ledger.wakeSignals.publish({
          executionId: id,
          reason: toWakeReason(closed.status),
        });
        return closed;
      });
      notifyBackgroundExecutionChange(this.rootDir, id, { terminal: true });
      return closed;
    } finally {
      ledger.close();
    }
  }

  listWakeSignals() {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.wakeSignals.list();
    } finally {
      ledger.close();
    }
  }
}

export function reconcileBackgroundExecutions(
  rootDir: string,
  ownerSessionId?: string,
  now = new Date(),
): { lostExecutions: ExecutionRecord[] } {
  const store = new BackgroundExecutionStore(rootDir);
  const lostExecutions: ExecutionRecord[] = [];
  for (const execution of store.listAll(ownerSessionId).filter((candidate) =>
    candidate.status === "created" || candidate.status === "running" || candidate.status === "cancelling")) {
    const recoveryLedger = new ControlPlaneLedger(rootDir);
    let recovered: ExecutionRecord | undefined;
    try {
      recovered = recoveryLedger.executions.claimRecovery(execution.id, now);
    } finally {
      recoveryLedger.close();
    }
    if (!recovered) continue;
    const ownership = executionOwnership(recovered);
    const identity = execution.processIdentity as ProcessIdentity | undefined;
    if (identity && !isSameProcess(identity)) {
      lostExecutions.push(store.close(execution.id, ownership, {
        status: "lost",
        summary: `Background process identity changed before completion: pid=${execution.pid}`,
        closeReason: "process_identity_changed",
      }));
      continue;
    }
    if (typeof execution.pid === "number" && isProcessAlive(execution.pid)) {
      try { terminatePid(execution.pid, identity); }
      catch { /* terminal record remains lost even if OS confirmation is unavailable */ }
    }
    lostExecutions.push(store.close(execution.id, ownership, {
      status: "lost",
      summary: typeof execution.pid === "number"
        ? `Background controller lease expired before completion: pid=${execution.pid}`
        : "Background controller lease expired before process registration.",
      closeReason: typeof execution.pid === "number" ? "controller_lease_expired" : "launch_unconfirmed",
    }));
  }
  return { lostExecutions };
}

export function terminateBackgroundExecution(rootDir: string, id: string, ownerSessionId?: string): ExecutionRecord {
  const store = new BackgroundExecutionStore(rootDir);
  const execution = store.load(id, ownerSessionId);
  if (!execution) {
    throw unknownExecution(id);
  }
  if (execution.status === "completed" || execution.status === "failed" || execution.status === "aborted" || execution.status === "lost") {
    return execution;
  }

  const identity = execution.processIdentity as ProcessIdentity | undefined;
  if (identity && !isSameProcess(identity)) {
    const ledger = new ControlPlaneLedger(rootDir);
    try {
      const claimed = ledger.executions.claimCancellation(id, ownerSessionId);
      if (!claimed) return store.load(id, ownerSessionId)!;
      return store.close(id, executionOwnership(claimed), {
        status: "lost",
        summary: `Process identity changed before termination: pid=${execution.pid}`,
        closeReason: "process_identity_changed",
      });
    } finally {
      ledger.close();
    }
  }
  const cancellingLedger = new ControlPlaneLedger(rootDir);
  let cancelling: ExecutionRecord | undefined;
  try {
    cancelling = cancellingLedger.executions.claimCancellation(id, ownerSessionId);
  } finally {
    cancellingLedger.close();
  }
  if (!cancelling) return store.load(id, ownerSessionId)!;
  terminateRegisteredBackgroundProcess(id);
  if (typeof execution.pid === "number") {
    terminatePid(execution.pid, identity);
  }
  return store.close(id, executionOwnership(cancelling), {
    status: "aborted",
    summary: "Background execution terminated by host lifecycle.",
    closeReason: "terminated",
    terminatedBy: "host",
  });
}

export function isBackgroundExecutionActive(execution: ExecutionRecord): boolean {
  return execution.kind === "background" && (
    execution.status === "created" ||
    execution.status === "running" ||
    execution.status === "cancelling"
  );
}

export function registerBackgroundProcess(
  id: string,
  subprocess: BackgroundProcessHandle,
  stopParentDeathWatchdog?: () => void,
): void {
  const pid = (subprocess as BackgroundProcessHandle & { pid?: number }).pid;
  const stopWatchdog = stopParentDeathWatchdog ?? (typeof pid === "number" && pid > 0
    ? watchProcessUntilParentExit({ parentPid: process.pid, targetPid: pid, targetIdentity: inspectProcessIdentity(pid) })
    : () => undefined);
  const settled = Promise.resolve(subprocess)
    .then(() => undefined, () => undefined)
    .finally(() => {
      stopWatchdog();
      activeBackgroundProcesses.delete(id);
    });
  activeBackgroundProcesses.set(id, {
    kill: () => {
      stopWatchdog();
      subprocess.kill?.("SIGTERM");
    },
    settled,
  });
}

export async function waitForRegisteredBackgroundProcess(id: string, timeoutMs = 5_000): Promise<void> {
  const handle = activeBackgroundProcesses.get(id);
  if (!handle) {
    return;
  }
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    handle.settled,
    new Promise<void>((resolve) => {
      timer = setTimeout(resolve, timeoutMs);
    }),
  ]).finally(() => {
    if (timer) {
      clearTimeout(timer);
    }
  });
}

function terminateRegisteredBackgroundProcess(id: string): void {
  activeBackgroundProcesses.get(id)?.kill();
}

function toWakeReason(status: ExecutionRecord["status"]): WakeSignalReason {
  if (status === "completed" || status === "failed" || status === "aborted" || status === "lost") {
    return status;
  }
  return "failed";
}
