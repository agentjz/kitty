import { isAbortError } from "../utils/abort.js";
import type { MediaHttpRequest } from "./providers/agnes.js";

export class MediaProviderError extends Error {
  constructor(
    message: string,
    readonly kind: "user" | "contract" | "temporary" | "provider" | "environment" | "timeout" | "aborted",
    readonly status?: number,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = "MediaProviderError";
  }
}

export interface MediaHttpOptions {
  timeoutMs: number;
  signal?: AbortSignal;
  retryGet?: boolean;
  retryResponseStatuses?: readonly number[];
  maxAttempts?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  maxBytes?: number;
}

export async function requestMediaJson(request: MediaHttpRequest, options: MediaHttpOptions): Promise<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? abortableSleep;
  const retryGet = request.method === "GET" && options.retryGet;
  const retryResponseStatuses = request.method === "POST" ? new Set(options.retryResponseStatuses ?? []) : undefined;
  const retriesEnabled = retryGet || Boolean(retryResponseStatuses?.size);
  const attempts = retriesEnabled ? Math.max(1, Math.min(4, options.maxAttempts ?? 3)) : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchMedia(request, options.timeoutMs, options.signal, fetchImpl);
      if (!response.ok) {
        const error = await providerError(response);
        if (attempt + 1 < attempts && (retryGet ? isRetryableStatus(response.status) : retryResponseStatuses?.has(response.status))) {
          await sleep(error.retryAfterMs ?? retryDelay(attempt, response.status), options.signal);
          continue;
        }
        throw error;
      }
      const text = await response.text();
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new MediaProviderError("Media provider returned invalid JSON.", "contract", response.status);
      }
    } catch (error) {
      if (isAbortError(error)) throw new MediaProviderError("Media request was aborted.", "aborted");
      lastError = error;
      if (attempt + 1 < attempts && retryGet && isTransientError(error)) {
        await sleep(retryDelay(attempt), options.signal);
        continue;
      }
      throw error;
    }
  }
  throw lastError ?? new MediaProviderError("Media request failed.", "environment");
}

export async function downloadMedia(
  request: MediaHttpRequest,
  options: MediaHttpOptions,
): Promise<{ bytes: Buffer; contentType: string | undefined }> {
  if (request.method !== "GET") throw new MediaProviderError("Media downloads must use GET.", "contract");
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep = options.sleep ?? abortableSleep;
  const attempts = options.retryGet ? 3 : 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchMedia(request, options.timeoutMs, options.signal, fetchImpl);
      if (!response.ok) {
        const error = await providerError(response);
        if (attempt + 1 < attempts && isRetryableStatus(response.status)) {
          await sleep(error.retryAfterMs ?? retryDelay(attempt), options.signal);
          continue;
        }
        throw error;
      }
      const bytes = await readBoundedBody(response, options.maxBytes ?? 1_000_000_000);
      return { bytes, contentType: response.headers.get("content-type") ?? undefined };
    } catch (error) {
      if (attempt + 1 < attempts && isTransientError(error)) {
        await sleep(retryDelay(attempt), options.signal);
        continue;
      }
      throw error;
    }
  }
  throw new MediaProviderError("Media download failed.", "environment");
}

async function fetchMedia(
  request: MediaHttpRequest,
  timeoutMs: number,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
): Promise<Response> {
  const controller = new AbortController();
  let timedOut = false;
  const timeout = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener("abort", forwardAbort, { once: true });
  if (signal?.aborted) controller.abort();
  try {
    return await fetchImpl(request.endpoint, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new MediaProviderError("Media request was aborted.", "aborted");
    if (timedOut) throw new MediaProviderError("Media request timed out.", "timeout");
    if (controller.signal.aborted || isAbortError(error)) throw new MediaProviderError("Media request was aborted.", "aborted");
    throw new MediaProviderError(`Media network request failed: ${error instanceof Error ? error.message : String(error)}`, "environment");
  } finally {
    clearTimeout(timeout);
    signal?.removeEventListener("abort", forwardAbort);
  }
}

async function providerError(response: Response): Promise<MediaProviderError> {
  const body = await response.text().catch(() => "");
  const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
  const requestId = body.match(/\breq_[a-zA-Z0-9]+\b/u)?.[0];
  const providerMessage = extractProviderMessage(body);
  const retryHint = retryAfterMs !== undefined ? ` Retry after ${Math.ceil(retryAfterMs / 1_000)} seconds.` : "";
  const message = response.status === 503
    ? `Media provider is temporarily unavailable (HTTP 503${requestId ? `, request ${requestId}` : ""}).${retryHint}`
    : response.status === 429
      ? `Media provider rate limit reached (HTTP 429).${retryHint}`
      : providerMessage || `Media provider returned HTTP ${response.status}.`;
  const kind = response.status >= 400 && response.status < 500 && response.status !== 408 && response.status !== 429 ? "user" : response.status >= 500 || response.status === 408 || response.status === 429 ? "temporary" : "provider";
  return new MediaProviderError(message, kind, response.status, retryAfterMs);
}

function extractProviderMessage(body: string): string {
  const fallback = body.trim().slice(0, 500);
  if (!fallback) return "";
  try {
    const parsed = JSON.parse(body) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return fallback;
    const root = parsed as Record<string, unknown>;
    const error = root.error && typeof root.error === "object" && !Array.isArray(root.error)
      ? root.error as Record<string, unknown>
      : undefined;
    const value = error?.message ?? error?.detail ?? root.detail ?? root.message;
    return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : fallback;
  } catch {
    return fallback;
  }
}

function isRetryableStatus(status: number): boolean { return status === 408 || status === 429 || status >= 500; }
function isTransientError(error: unknown): boolean { return error instanceof MediaProviderError && (error.kind === "temporary" || error.kind === "environment"); }
function retryDelay(attempt: number, status?: number): number {
  if (status === 429) return 60_000;
  if (status !== undefined) return Math.min(30_000, 2_000 * 2 ** attempt);
  return Math.min(10_000, 500 * 2 ** attempt);
}

function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(60_000, Math.trunc(seconds * 1_000)));
  const at = Date.parse(value);
  return Number.isFinite(at) ? Math.max(0, Math.min(60_000, at - Date.now())) : undefined;
}

async function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) throw new MediaProviderError("Media request was aborted.", "aborted");
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new MediaProviderError("Media request was aborted.", "aborted")); }, { once: true });
  });
}

async function readBoundedBody(response: Response, maxBytes: number): Promise<Buffer> {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw new MediaProviderError("Media download exceeded the configured size limit.", "contract", response.status);
  }
  if (!response.body) return Buffer.alloc(0);
  const reader = response.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw new MediaProviderError("Media download exceeded the configured size limit.", "contract", response.status);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof MediaProviderError) throw error;
    throw new MediaProviderError(`Media download was interrupted: ${error instanceof Error ? error.message : String(error)}`, "environment");
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks, total);
}
