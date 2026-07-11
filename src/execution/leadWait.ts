import { ExecutionStore, type ExecutionRecord } from "./store.js";
import { isLeadBlockingPolicy, isLeadWaitTerminalStatus } from "./leadWaitPolicy.js";
import { createInternalReminder } from "../session/turnFrame.js";
import { throwIfAborted } from "../utils/abort.js";
import { terminatePid } from "./process.js";

const POLL_INTERVAL_MS = 250;
const DEFAULT_LEAD_WAIT_TIMEOUT_MS = 30 * 60 * 1000;

export function listLeadWaitExecutions(rootDir: string): ExecutionRecord[] {
  return new ExecutionStore(rootDir)
    .list()
    .filter((execution) => execution.requestedBy === "lead" && isLeadBlockingPolicy(execution.waitPolicy));
}

export function collectNewLeadWaitExecutionIds(
  before: readonly ExecutionRecord[],
  after: readonly ExecutionRecord[],
): string[] {
  const seen = new Set(before.map((execution) => execution.id));
  return after
    .filter((execution) => !seen.has(execution.id))
    .map((execution) => execution.id);
}

export function collectLeadWaitExecutionResults(rootDir: string, executionIds: readonly string[]): ExecutionRecord[] {
  const store = new ExecutionStore(rootDir);
  return executionIds
    .map((id) => store.load(id))
    .filter((record): record is ExecutionRecord => Boolean(record));
}

export function hasUnsettledLeadWaitExecutions(rootDir: string, executionIds: readonly string[]): boolean {
  return collectLeadWaitExecutionResults(rootDir, executionIds)
    .some((execution) =>
      isLeadBlockingPolicy(execution.waitPolicy) &&
      !isLeadWaitTerminalStatus(execution.waitPolicy, execution.status));
}

export async function waitForLeadWaitExecutions(input: {
  rootDir: string;
  executionIds: readonly string[];
  abortSignal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  onPoll?: (executions: readonly ExecutionRecord[]) => void | Promise<void>;
}): Promise<ExecutionRecord[]> {
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const now = input.now ?? (() => Date.now());

  for (;;) {
    throwIfAborted(input.abortSignal, "Lead wait was aborted.");
    cancelExpiredLeadWaitExecutions(input.rootDir, input.executionIds, now());
    const executions = collectLeadWaitExecutionResults(input.rootDir, input.executionIds);
    await input.onPoll?.(executions);
    if (!hasUnsettledLeadWaitExecutions(input.rootDir, input.executionIds)) {
      return collectLeadWaitExecutionResults(input.rootDir, input.executionIds);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export function cancelExpiredLeadWaitExecutions(
  rootDir: string,
  executionIds: readonly string[],
  nowMs = Date.now(),
): ExecutionRecord[] {
  const store = new ExecutionStore(rootDir);
  const aborted: ExecutionRecord[] = [];
  for (const execution of collectLeadWaitExecutionResults(rootDir, executionIds)) {
    if (!isLeadBlockingPolicy(execution.waitPolicy) || isLeadWaitTerminalStatus(execution.waitPolicy, execution.status)) {
      continue;
    }
    const deadline = getLeadWaitDeadlineMs(execution);
    if (deadline > nowMs) {
      continue;
    }
    store.requestCancellation(execution.id);
    if (typeof execution.pid === "number") terminatePid(execution.pid);
    aborted.push(store.close(execution.id, {
      status: "aborted",
      summary: `Execution ${execution.id} exceeded its deadline and was terminated.`,
      closeReason: "deadline_exceeded",
      terminatedBy: "lead_wait_deadline",
    }));
  }
  return aborted;
}

export function getLeadWaitDeadlineMs(execution: ExecutionRecord): number {
  const startedAt = Date.parse(execution.startedAt ?? execution.createdAt);
  const base = Number.isFinite(startedAt) ? startedAt : Date.parse(execution.createdAt);
  const timeoutMs = typeof execution.timeoutMs === "number" && execution.timeoutMs > 0
    ? execution.timeoutMs
    : DEFAULT_LEAD_WAIT_TIMEOUT_MS;
  return base + timeoutMs;
}

export function buildLeadWakeInput(executions: readonly ExecutionRecord[]): string {
  return buildLeadWakeFacts(executions).userInput;
}

export function buildLeadWakeFacts(executions: readonly ExecutionRecord[]): {
  userInput: string;
  promptBlock: string;
} {
  const lines = executions.flatMap((execution) => {
    const subject = execution.actorName ?? execution.command ?? execution.id;
    const summary = execution.summary ?? execution.output ?? "";
    return [
      `- ${execution.kind} ${execution.id}: ${execution.status}; ${subject}${summary ? `; ${summary}` : ""}`,
      execution.assignment?.objective ? `  objective: ${execution.assignment.objective}` : undefined,
      execution.assignment?.boundary ? `  boundary: ${execution.assignment.boundary}` : undefined,
      execution.assignment?.expectedOutput ? `  expected output: ${execution.assignment.expectedOutput}` : undefined,
      execution.output && execution.summary !== execution.output ? `  output: ${truncateWakeFact(execution.output)}` : undefined,
    ].filter((line): line is string => Boolean(line));
  });

  const promptBlock = [
    "Lead wake facts",
    "Internal wake signal: delegated executions settled.",
    "Execution results:",
    ...lines,
    "Continue the lead turn. Use the execution facts as evidence.",
  ].join("\n");

  return {
    userInput: createInternalReminder("Delegated execution wake facts are available in the runtime fact block."),
    promptBlock,
  };
}

function truncateWakeFact(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 500)}...`;
}
