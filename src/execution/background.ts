import { ControlPlaneLedger, type ExecutionRecord, type WakeSignalReason } from "../control/ledger.js";
import { isProcessAlive, terminatePid } from "./process.js";
import { unknownExecution } from "./errors.js";
import { sleepWithSignal, throwIfAborted } from "../utils/abort.js";

interface BackgroundProcessHandle {
  kill?: (signal?: NodeJS.Signals | number, error?: Error) => unknown;
  then: Promise<unknown>["then"];
}

const activeBackgroundProcesses = new Map<string, {
  kill: () => void;
  settled: Promise<void>;
}>();

const DEFAULT_BACKGROUND_WAIT_INTERVAL_MS = 250;

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

  updateRunningOutput(id: string, input: {
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
      if (execution.status !== "running") {
        return execution;
      }
      return ledger.executions.save({
        ...execution,
        output: input.output ?? execution.output,
        summary: input.summary ?? execution.summary,
        lastOutputAt: input.lastOutputAt ?? new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    } finally {
      ledger.close();
    }
  }

  close(id: string, input: {
    status: "completed" | "failed" | "aborted" | "stale" | "paused";
    exitCode?: number | null;
    output?: string;
    summary?: string;
    closeReason?: string;
    terminatedBy?: string;
    error?: string;
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
      closeReason: "process_disappeared",
    }));
  }
  return { staleExecutions };
}

export async function waitForBackgroundExecution(input: {
  rootDir: string;
  id: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  abortSignal?: AbortSignal;
}): Promise<ExecutionRecord> {
  const store = new BackgroundExecutionStore(input.rootDir);
  const startedAt = Date.now();
  const timeoutMs = Math.max(0, Math.trunc(input.timeoutMs ?? 60_000));
  const pollIntervalMs = Math.max(25, Math.trunc(input.pollIntervalMs ?? DEFAULT_BACKGROUND_WAIT_INTERVAL_MS));

  for (;;) {
    throwIfAborted(input.abortSignal, "Background wait aborted.");
    reconcileBackgroundExecutions(input.rootDir);
    const execution = store.load(input.id);
    if (!execution) {
      throw unknownExecution(input.id);
    }
    if (!isBackgroundExecutionActive(execution)) {
      return execution;
    }
    if (Date.now() - startedAt >= timeoutMs) {
      return execution;
    }
    await sleepWithSignal(pollIntervalMs, input.abortSignal);
  }
}

export function terminateBackgroundExecution(rootDir: string, id: string): ExecutionRecord {
  const store = new BackgroundExecutionStore(rootDir);
  const execution = store.load(id);
  if (!execution) {
    throw unknownExecution(id);
  }
  if (execution.status === "completed" || execution.status === "failed" || execution.status === "aborted" || execution.status === "stale") {
    return execution;
  }
  terminateRegisteredBackgroundProcess(id);
  if (typeof execution.pid === "number") {
    terminatePid(execution.pid);
  }
  return store.close(id, {
    status: "aborted",
    summary: "Background execution terminated by host lifecycle.",
    closeReason: "terminated",
    terminatedBy: "host",
  });
}

export function isBackgroundExecutionActive(execution: ExecutionRecord): boolean {
  return execution.kind === "background" && (
    execution.status === "created" ||
    execution.status === "running"
  );
}

export function registerBackgroundProcess(id: string, subprocess: BackgroundProcessHandle): void {
  const settled = Promise.resolve(subprocess)
    .then(() => undefined, () => undefined)
    .finally(() => {
      activeBackgroundProcesses.delete(id);
    });
  activeBackgroundProcesses.set(id, {
    kill: () => {
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
  if (status === "completed" || status === "failed" || status === "aborted" || status === "paused" || status === "stale") {
    return status;
  }
  return "failed";
}
