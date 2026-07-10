import { isAbortError, sleepWithSignal, throwIfAborted } from "../utils/abort.js";

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
  const retryAfterMs = readRetryAfterMs(error);
  if (typeof retryAfterMs === "number") {
    return Math.min(retryAfterMs, API_RETRY_MAX_DELAY_MS);
  }

  const exponent = Math.max(0, attempt - 1);
  const base = Math.min(API_RETRY_MAX_DELAY_MS, API_RETRY_BASE_DELAY_MS * (2 ** exponent));
  const jitter = Math.min(1_000, Math.max(0, attempt * 137));
  return Math.min(API_RETRY_MAX_DELAY_MS, base + jitter);
}

export function isRetryableApiError(error: unknown): boolean {
  const status = (error as { status?: number }).status;
  if (typeof status === "number") {
    return status === 408 || status === 409 || status === 429 || status >= 500;
  }

  const code = String((error as { code?: unknown }).code ?? "");
  if ([
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
  ].includes(code)) {
    return true;
  }

  const message = String((error as { message?: unknown }).message ?? error).toLowerCase();
  return (
    message.includes("timeout") ||
    message.includes("network") ||
    message.includes("connection error") ||
    message.includes("connection reset") ||
    message.includes("connection refused") ||
    message.includes("econnreset") ||
    message.includes("econnrefused") ||
    message.includes("connect timeout") ||
    message.includes("temporarily") ||
    message.includes("rate limit") ||
    message.includes("overloaded")
  );
}

function readRetryAfterMs(error: unknown): number | undefined {
  const headers = (error as {
    headers?: {
      get?: (name: string) => string | null | undefined;
      [key: string]: unknown;
    };
  }).headers;
  const header = headers?.get?.("retry-after") ??
    headers?.get?.("Retry-After") ??
    readHeaderRecordValue(headers, "retry-after") ??
    readHeaderRecordValue(headers, "Retry-After");
  if (typeof header !== "string" || !header.trim()) {
    return undefined;
  }

  const seconds = Number(header);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.trunc(seconds * 1_000);
  }

  const timestamp = Date.parse(header);
  if (Number.isFinite(timestamp)) {
    return Math.max(0, timestamp - Date.now());
  }

  return undefined;
}

function readHeaderRecordValue(headers: unknown, key: string): string | undefined {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }

  const value = (headers as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
