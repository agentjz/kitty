import { ExecutionStore, type ExecutionRecord } from "./store.js";
import { isLeadBlockingPolicy, isLeadWaitTerminalStatus } from "../protocol/leadWait.js";
import { createInternalReminder } from "../session/turnFrame.js";
import { throwIfAborted } from "../utils/abort.js";

const POLL_INTERVAL_MS = 250;

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
}): Promise<ExecutionRecord[]> {
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  for (;;) {
    throwIfAborted(input.abortSignal, "Lead wait was aborted.");
    if (!hasUnsettledLeadWaitExecutions(input.rootDir, input.executionIds)) {
      return collectLeadWaitExecutionResults(input.rootDir, input.executionIds);
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

export function buildLeadWakeInput(executions: readonly ExecutionRecord[]): string {
  return buildLeadWakeFacts(executions).userInput;
}

export function buildLeadWakeFacts(executions: readonly ExecutionRecord[]): {
  userInput: string;
  promptBlock: string;
} {
  const lines = executions.map((execution) => {
    const subject = execution.actorName ?? execution.command ?? execution.id;
    const summary = execution.summary ?? execution.output ?? "";
    return `- ${execution.kind} ${execution.id}: ${execution.status}; ${subject}${summary ? `; ${summary}` : ""}`;
  });

  const promptBlock = [
    "Lead wake facts",
    "Internal wake signal: delegated executions settled.",
    "Execution results:",
    ...lines,
    "Continue from the current objective. Use the execution facts as evidence.",
  ].join("\n");

  return {
    userInput: createInternalReminder("Delegated execution wake facts are available in the runtime fact block."),
    promptBlock,
  };
}
