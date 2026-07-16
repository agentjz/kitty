import path from "node:path";

import type { ExecutionRecord } from "../control/types.js";

interface ExecutionSignalState {
  version: number;
  listeners: Set<() => void>;
}

interface ExecutionObserverCursor {
  rootDir: string;
  executionId: string;
  consumerId: string;
  fingerprint: string;
}

const signals = new Map<string, ExecutionSignalState>();
const observers = new Map<string, ExecutionObserverCursor>();

export function backgroundExecutionFingerprint(execution: ExecutionRecord): string {
  return JSON.stringify({
    status: execution.status,
    output: execution.output,
    summary: execution.summary,
    lastOutputAt: execution.lastOutputAt,
    exitCode: execution.exitCode,
    closeReason: execution.closeReason,
    terminatedBy: execution.terminatedBy,
    error: execution.error,
  });
}

export function notifyBackgroundExecutionChange(
  rootDir: string,
  executionId: string,
  options: { terminal?: boolean } = {},
): void {
  const key = executionKey(rootDir, executionId);
  const state = getSignalState(key);
  state.version += 1;
  for (const listener of [...state.listeners]) listener();
  if (options.terminal) {
    signals.delete(key);
    for (const [observerId, observer] of observers) {
      if (executionKey(observer.rootDir, observer.executionId) === key) observers.delete(observerId);
    }
  }
}

export function registerBackgroundExecutionObserver(input: {
  rootDir: string;
  execution: ExecutionRecord;
  consumerId: string;
}): void {
  observers.set(observerKey(input.rootDir, input.execution.id, input.consumerId), {
    rootDir: normalizeRoot(input.rootDir),
    executionId: input.execution.id,
    consumerId: input.consumerId,
    fingerprint: backgroundExecutionFingerprint(input.execution),
  });
}

export function readBackgroundExecutionObserver(input: {
  rootDir: string;
  execution: ExecutionRecord;
  consumerId: string;
}): ExecutionObserverCursor {
  const key = observerKey(input.rootDir, input.execution.id, input.consumerId);
  const existing = observers.get(key);
  if (existing) return existing;
  registerBackgroundExecutionObserver(input);
  return observers.get(key)!;
}

export function advanceBackgroundExecutionObserver(input: {
  rootDir: string;
  execution: ExecutionRecord;
  consumerId: string;
}): void {
  registerBackgroundExecutionObserver(input);
}

export function clearBackgroundExecutionObserver(rootDir: string, executionId: string, consumerId: string): void {
  observers.delete(observerKey(rootDir, executionId, consumerId));
}

export function notifyBackgroundWaitersForConsumer(rootDir: string, consumerId: string): void {
  const normalizedRoot = normalizeRoot(rootDir);
  for (const observer of observers.values()) {
    if (observer.rootDir === normalizedRoot && observer.consumerId === consumerId) {
      notifyBackgroundExecutionChange(normalizedRoot, observer.executionId);
    }
  }
}

export async function waitForBackgroundExecutionSignal(input: {
  rootDir: string;
  executionId: string;
  timeoutMs: number;
  abortSignal?: AbortSignal;
}): Promise<void> {
  if (input.timeoutMs <= 0 || input.abortSignal?.aborted) return;
  const state = getSignalState(executionKey(input.rootDir, input.executionId));
  const initialVersion = state.version;
  await new Promise<void>((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const finish = () => {
      if (timer) clearTimeout(timer);
      state.listeners.delete(onChange);
      input.abortSignal?.removeEventListener("abort", finish);
      resolve();
    };
    const onChange = () => finish();
    state.listeners.add(onChange);
    input.abortSignal?.addEventListener("abort", finish, { once: true });
    timer = setTimeout(finish, input.timeoutMs);
    if (state.version !== initialVersion) finish();
  });
}

function getSignalState(key: string): ExecutionSignalState {
  const existing = signals.get(key);
  if (existing) return existing;
  const created = { version: 0, listeners: new Set<() => void>() };
  signals.set(key, created);
  return created;
}

function executionKey(rootDir: string, executionId: string): string {
  return normalizeRoot(rootDir) + "::execution::" + executionId;
}

function observerKey(rootDir: string, executionId: string, consumerId: string): string {
  return executionKey(rootDir, executionId) + "::consumer::" + consumerId;
}

function normalizeRoot(rootDir: string): string {
  const resolved = path.resolve(rootDir);
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}
