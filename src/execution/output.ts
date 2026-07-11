import { ExecutionStore, type ExecutionRecord } from "./store.js";
import { executionKindMismatch, unknownExecution } from "./errors.js";

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
  const execution = requireExecution(new ExecutionStore(input.rootDir).load(input.id), input.id);
  if (input.kind && execution.kind !== input.kind) {
    throw executionKindMismatch(input.id, execution.kind, input.kind);
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

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) {
    throw unknownExecution(id);
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
