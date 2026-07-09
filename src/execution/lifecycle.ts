import { reconcileBackgroundExecutions, terminateBackgroundExecution } from "./background.js";
import { EXECUTION_KINDS } from "./kinds.js";
import { isProcessAlive, terminatePid } from "./process.js";
import { ExecutionStore, type ExecutionKind, type ExecutionRecord } from "./store.js";

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
export type ExecutionOutputMode = "summary" | "tail" | "full";

export interface ExecutionOutputRead {
  id: string;
  kind: string;
  status: string;
  mode: ExecutionOutputMode;
  output: string;
  truncated: boolean;
  lines?: number;
  bytes: number;
  summary?: string;
  lastOutputAt?: string;
}

export function readExecutionOutput(input: {
  rootDir: string;
  id: string;
  mode?: ExecutionOutputMode;
  lines?: number;
  maxChars?: number;
  kind?: ExecutionRecord["kind"];
}): ExecutionOutputRead {
  const store = new ExecutionStore(input.rootDir);
  const execution = requireExecution(store.load(input.id), input.id);
  if (input.kind && execution.kind !== input.kind) {
    throw new Error(`Execution ${input.id} is '${execution.kind}', not '${input.kind}'.`);
  }
  const mode = input.mode ?? "tail";
  const source = mode === "summary"
    ? (execution.summary ?? execution.output ?? "")
    : (execution.output ?? execution.summary ?? "");
  const lines = Math.max(1, Math.trunc(input.lines ?? 80));
  const maxChars = Math.max(1, Math.trunc(input.maxChars ?? 20_000));
  const selected = mode === "tail" ? takeTailLines(source, lines) : source;
  const truncatedOutput = truncateOutput(selected, maxChars);
  return {
    id: execution.id,
    kind: execution.kind,
    status: execution.status,
    mode,
    output: truncatedOutput.output,
    truncated: truncatedOutput.truncated,
    lines: mode === "tail" ? lines : undefined,
    bytes: Buffer.byteLength(source, "utf8"),
    summary: execution.summary,
    lastOutputAt: execution.lastOutputAt,
  };
}

export function cancelExecution(rootDir: string, id: string, input: {
  expectedKind?: ExecutionRecord["kind"];
  terminatedBy?: string;
  summary?: string;
} = {}): ExecutionRecord {
  const store = new ExecutionStore(rootDir);
  const execution = requireExecution(store.load(id), id);
  if (input.expectedKind && execution.kind !== input.expectedKind) {
    throw new Error(`Execution ${id} is '${execution.kind}', not '${input.expectedKind}'.`);
  }
  if (isSettled(execution)) {
    return execution;
  }
  if (typeof execution.pid === "number") {
    terminatePid(execution.pid);
  }
  return store.close(id, {
    status: "aborted",
    summary: input.summary ?? `${readExecutionKindLabel(execution.kind)} execution cancelled by host lifecycle.`,
    closeReason: "cancelled",
    terminatedBy: input.terminatedBy ?? "host",
    output: execution.output,
  });
}

export function reconcileExecutions(rootDir: string, input: {
  kinds?: readonly ExecutionRecord["kind"][];
} = {}): { staleExecutions: ExecutionRecord[] } {
  const store = new ExecutionStore(rootDir);
  const staleExecutions: ExecutionRecord[] = [];
  const kinds = new Set(input.kinds ?? []);
  for (const execution of store.list({ statuses: ["running"] })) {
    if (kinds.size > 0 && !kinds.has(execution.kind)) {
      continue;
    }
    if (typeof execution.pid !== "number" || isProcessAlive(execution.pid)) {
      continue;
    }
    staleExecutions.push(store.close(execution.id, {
      status: "stale",
      output: execution.output,
      summary: `${readExecutionKindLabel(execution.kind)} process disappeared before reporting completion: pid=${execution.pid}`,
      closeReason: "process_disappeared",
    }));
  }
  return { staleExecutions };
}

export function isSettled(execution: ExecutionRecord): boolean {
  return execution.status === "completed" ||
    execution.status === "failed" ||
    execution.status === "aborted" ||
    execution.status === "stale";
}

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) {
    throw new Error(`Unknown execution: ${id}`);
  }
  return record;
}

function takeTailLines(value: string, lines: number): string {
  const normalized = value.replace(/\r\n/g, "\n");
  const parts = normalized.endsWith("\n")
    ? normalized.slice(0, -1).split("\n")
    : normalized.split("\n");
  return parts.slice(-lines).join("\n");
}

function truncateOutput(value: string, maxChars: number): { output: string; truncated: boolean } {
  if (value.length <= maxChars) {
    return { output: value, truncated: false };
  }
  return {
    output: value.slice(Math.max(0, value.length - maxChars)),
    truncated: true,
  };
}

function readExecutionKindLabel(kind: string): string {
  switch (kind) {
    case "background":
      return "Background";
    case "subagent":
      return "Subagent";
    default:
      return "Delegated";
  }
}
