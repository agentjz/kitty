import { isAbortError, sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import { isRetryableProviderError, readProviderRetryAfterMs } from "./errors.js";

export const API_MAX_ATTEMPTS = 4;
const API_RETRY_BASE_DELAY_MS = 1_000;
const API_RETRY_MAX_DELAY_MS = 30_000;
const API_RETRY_MAX_TOTAL_WAIT_MS = 90_000;

export interface ApiRetryState {
  failedAttempt: number;
  nextAttempt: number;
  maxAttempts: number;
  delayMs: number;
  error: unknown;
}

export interface ApiRetryBudget {
  attempts: number;
  totalWaitMs: number;
}

export interface ApiRetryOptions {
  abortSignal?: AbortSignal;
  onRetry?: (state: ApiRetryState) => void;
  sleep?: (ms: number, abortSignal?: AbortSignal) => Promise<void>;
  budget?: ApiRetryBudget;
}

export function createApiRetryBudget(): ApiRetryBudget {
  return {
    attempts: 0,
    totalWaitMs: 0,
  };
}

export async function withApiRetries<T>(
  operation: () => Promise<T>,
  options: ApiRetryOptions = {},
): Promise<T> {
  let lastError: unknown;
  const budget = options.budget ?? createApiRetryBudget();

  while (budget.attempts < API_MAX_ATTEMPTS) {
    throwIfAborted(options.abortSignal, "Model request retry aborted");
    budget.attempts += 1;
    const attempt = budget.attempts;
    try {
      return await operation();
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }

      lastError = error;
      if (!isRetryableApiError(error) || attempt === API_MAX_ATTEMPTS) {
        break;
      }

      const delayMs = computeApiRetryDelayMs(error, attempt);
      if (budget.totalWaitMs + delayMs > API_RETRY_MAX_TOTAL_WAIT_MS) {
        break;
      }

      budget.totalWaitMs += delayMs;
      options.onRetry?.({
        failedAttempt: attempt,
        nextAttempt: attempt + 1,
        maxAttempts: API_MAX_ATTEMPTS,
        delayMs,
        error,
      });
      await (options.sleep ?? sleepWithSignal)(delayMs, options.abortSignal);
      throwIfAborted(options.abortSignal, "Model request retry aborted");
    }
  }

  throw lastError;
}

export function computeApiRetryDelayMs(error: unknown, attempt: number): number {
  const retryAfterMs = readProviderRetryAfterMs(error);
  if (typeof retryAfterMs === "number") {
    return retryAfterMs;
  }

  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(API_RETRY_MAX_DELAY_MS, API_RETRY_BASE_DELAY_MS * (2 ** exponent));
  const jitter = Math.min(1_000, Math.max(0, attempt * 137));
  return Math.min(API_RETRY_MAX_DELAY_MS, base + jitter);
}

export function isRetryableApiError(error: unknown): boolean {
  return isRetryableProviderError(error);
}
