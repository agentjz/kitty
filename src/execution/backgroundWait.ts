import { ControlPlaneLedger } from "../control/ledger.js";
import type { ExecutionRecord } from "../control/types.js";
import { throwIfAborted } from "../utils/abort.js";
import {
  BackgroundExecutionStore,
  isBackgroundExecutionActive,
  reconcileBackgroundExecutions,
} from "./background.js";
import {
  advanceBackgroundExecutionObserver,
  backgroundExecutionFingerprint,
  clearBackgroundExecutionObserver,
  readBackgroundExecutionObserver,
  waitForBackgroundExecutionSignal,
} from "./backgroundSignals.js";
import { unknownExecution } from "./errors.js";

export type BackgroundWaitReason = "progress" | "settled" | "steer" | "quiet_timeout";

export interface BackgroundWaitResult {
  reason: BackgroundWaitReason;
  changed: boolean;
  waitedMs: number;
  execution: ExecutionRecord;
}

const DEFAULT_QUIET_TIMEOUT_MS = 60_000;
const DEFAULT_FALLBACK_POLL_MS = 250;
const DEFAULT_PROGRESS_DEBOUNCE_MS = 150;

export async function waitForBackgroundExecutionChange(input: {
  rootDir: string;
  id: string;
  ownerSessionId?: string;
  turnId?: string;
  consumerId?: string;
  timeoutMs?: number;
  fallbackPollMs?: number;
  progressDebounceMs?: number;
  abortSignal?: AbortSignal;
}): Promise<BackgroundWaitResult> {
  const startedAt = Date.now();
  const quietTimeoutMs = clampDuration(input.timeoutMs, DEFAULT_QUIET_TIMEOUT_MS);
  const fallbackPollMs = Math.max(1, clampDuration(input.fallbackPollMs, DEFAULT_FALLBACK_POLL_MS));
  const progressDebounceMs = clampDuration(input.progressDebounceMs, DEFAULT_PROGRESS_DEBOUNCE_MS);
  const quietDeadline = startedAt + quietTimeoutMs;
  const store = new BackgroundExecutionStore(input.rootDir);
  const consumerId = input.consumerId ?? input.turnId;
  if (!consumerId) throw new Error("Background wait requires a consumer identifier.");

  throwIfAborted(input.abortSignal, "Background wait aborted.");
  let execution = loadCurrentExecution(store, input);
  const observer = readBackgroundExecutionObserver({
    rootDir: input.rootDir,
    execution,
    consumerId,
  });
  let progressDetectedAt: number | undefined;

  for (;;) {
    throwIfAborted(input.abortSignal, "Background wait aborted.");
    reconcileBackgroundExecutions(input.rootDir, input.ownerSessionId);
    execution = loadCurrentExecution(store, input);

    if (input.turnId && hasPendingSteer(input.rootDir, input.turnId)) {
      return makeResult("steer", false, startedAt, execution);
    }

    if (!isBackgroundExecutionActive(execution)) {
      clearBackgroundExecutionObserver(input.rootDir, input.id, consumerId);
      return makeResult("settled", true, startedAt, execution);
    }

    const changed = backgroundExecutionFingerprint(execution) !== observer.fingerprint;
    if (changed && progressDetectedAt === undefined) {
      progressDetectedAt = Date.now();
    }

    const now = Date.now();
    if (progressDetectedAt !== undefined && (
      now >= progressDetectedAt + progressDebounceMs || now >= quietDeadline
    )) {
      advanceBackgroundExecutionObserver({
        rootDir: input.rootDir,
        execution,
        consumerId,
      });
      return makeResult("progress", true, startedAt, execution);
    }

    if (now >= quietDeadline) {
      return makeResult("quiet_timeout", false, startedAt, execution);
    }

    const nextDeadline = progressDetectedAt === undefined
      ? quietDeadline
      : Math.min(quietDeadline, progressDetectedAt + progressDebounceMs);
    await waitForBackgroundExecutionSignal({
      rootDir: input.rootDir,
      executionId: input.id,
      timeoutMs: Math.min(fallbackPollMs, Math.max(1, nextDeadline - now)),
      abortSignal: input.abortSignal,
    });
  }
}

function loadCurrentExecution(
  store: BackgroundExecutionStore,
  input: { id: string; ownerSessionId?: string },
): ExecutionRecord {
  const execution = store.load(input.id, input.ownerSessionId);
  if (!execution) throw unknownExecution(input.id);
  return execution;
}

function hasPendingSteer(rootDir: string, turnId: string): boolean {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    return ledger.turnSteers.listPending(turnId).length > 0;
  } finally {
    ledger.close();
  }
}

function makeResult(
  reason: BackgroundWaitReason,
  changed: boolean,
  startedAt: number,
  execution: ExecutionRecord,
): BackgroundWaitResult {
  return {
    reason,
    changed,
    waitedMs: Math.max(0, Date.now() - startedAt),
    execution,
  };
}

function clampDuration(value: number | undefined, fallback: number): number {
  return Math.max(0, Math.trunc(value ?? fallback));
}
