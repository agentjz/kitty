import { ControlPlaneLedger, type ExecutionRecord, type WakeSignalReason } from "../control/ledger.js";
import { isProcessAlive, terminatePid } from "./process.js";

export class BackgroundExecutionStore {
  constructor(private readonly rootDir: string) {}

  create(input: {
    command: string;
    cwd: string;
    requestedBy: string;
    sessionId?: string;
    timeoutMs?: number;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.create({
        kind: "background",
        status: "created",
        command: input.command,
        cwd: input.cwd,
        requestedBy: input.requestedBy,
        sessionId: input.sessionId,
        timeoutMs: input.timeoutMs,
      });
    } finally {
      ledger.close();
    }
  }

  load(id: string): ExecutionRecord | undefined {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.load(id);
    } finally {
      ledger.close();
    }
  }

  listRunning(cwd?: string): ExecutionRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.list({
        kind: "background",
        statuses: ["running"],
        cwd,
      });
    } finally {
      ledger.close();
    }
  }

  listAll(): ExecutionRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.list({ kind: "background" });
    } finally {
      ledger.close();
    }
  }

  markRunning(id: string, input: { pid: number }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.markRunning(id, input);
    } finally {
      ledger.close();
    }
  }

  close(id: string, input: {
    status: "completed" | "failed" | "aborted" | "stale" | "paused";
    exitCode?: number | null;
    output?: string;
    summary?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const closed = ledger.executions.close(id, input);
      ledger.wakeSignals.publish({
        executionId: id,
        reason: toWakeReason(input.status),
      });
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

export function reconcileBackgroundExecutions(rootDir: string): { staleExecutions: ExecutionRecord[] } {
  const store = new BackgroundExecutionStore(rootDir);
  const staleExecutions: ExecutionRecord[] = [];
  for (const execution of store.listRunning()) {
    if (typeof execution.pid !== "number" || isProcessAlive(execution.pid)) {
      continue;
    }
    staleExecutions.push(store.close(execution.id, {
      status: "stale",
      summary: `Background process disappeared before reporting completion: pid=${execution.pid}`,
    }));
  }
  return { staleExecutions };
}

export function terminateBackgroundExecution(rootDir: string, id: string): ExecutionRecord {
  const store = new BackgroundExecutionStore(rootDir);
  const execution = store.load(id);
  if (!execution) {
    throw new Error(`Unknown background execution: ${id}`);
  }
  if (execution.status === "completed" || execution.status === "failed" || execution.status === "aborted" || execution.status === "stale") {
    return execution;
  }
  if (typeof execution.pid === "number") {
    terminatePid(execution.pid);
  }
  return store.close(id, {
    status: "aborted",
    summary: "Background execution terminated by host lifecycle.",
  });
}

function toWakeReason(status: ExecutionRecord["status"]): WakeSignalReason {
  if (status === "completed" || status === "failed" || status === "aborted" || status === "paused" || status === "stale") {
    return status;
  }
  return "failed";
}
