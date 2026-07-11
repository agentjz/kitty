export type ProviderErrorKind =
  | "auth"
  | "contract"
  | "temporary"
  | "rate_limit"
  | "server"
  | "not_found"
  | "stream_framing"
  | "unknown";

export interface ProviderErrorFacts {
  kind: ProviderErrorKind;
  status?: number;
  code?: string;
  retryAfterMs?: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    readonly facts: ProviderErrorFacts,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ProviderError";
  }
}

export function classifyProviderError(error: unknown): ProviderErrorFacts {
  if (error instanceof ProviderError) {
    return error.facts;
  }

  const status = readStatus(error);
  const code = readCode(error);
  const message = readMessage(error).toLowerCase();

  if (status === 401 || status === 403 || includesAny(message, ["authentication failed", "invalid api key", "api key is invalid"])) {
    return { kind: "auth", status, code };
  }
  if (status === 400 || status === 413 || status === 422 || includesAny(message, ["invalid request", "unsupported parameter", "invalid parameter"])) {
    return { kind: "contract", status, code };
  }
  if (status === 404 || status === 405 || includesAny(message, ["returned 404"]) || message.trim() === "not found") {
    return { kind: "not_found", status, code };
  }
  if (status === 429 || includesAny(message, ["rate limit", "rate limited"])) {
    return { kind: "rate_limit", status, code, retryAfterMs: readRetryAfterMs(error) };
  }
  if (status === 408 || status === 409) {
    return { kind: "temporary", status, code, retryAfterMs: readRetryAfterMs(error) };
  }
  if (typeof status === "number" && status >= 500) {
    return { kind: "server", status, code, retryAfterMs: readRetryAfterMs(error) };
  }
  if (includesAny(message, [
    "stream ended unexpectedly",
    "unexpected end of stream",
    "invalid sse",
    "event stream parse",
  ])) {
    return { kind: "stream_framing", status, code };
  }
  if (isNetworkCode(code) || includesAny(message, [
    "fetch failed",
    "network",
    "timeout",
    "socket hang up",
    "connection error",
    "connection reset",
    "connection refused",
    "econnreset",
    "econnrefused",
    "connect timeout",
    "temporarily",
    "overloaded",
  ])) {
    return { kind: "temporary", status, code, retryAfterMs: readRetryAfterMs(error) };
  }
  return { kind: "unknown", status, code };
}

export function normalizeProviderError(error: unknown): ProviderError {
  if (error instanceof ProviderError) {
    return error;
  }

  return new ProviderError(readMessage(error), classifyProviderError(error), {
    cause: error,
  });
}

export function isRetryableProviderError(error: unknown): boolean {
  const kind = classifyProviderError(error).kind;
  return kind === "temporary" || kind === "rate_limit" || kind === "server";
}

export function isStreamingFallbackEligible(error: unknown): boolean {
  return classifyProviderError(error).kind === "stream_framing";
}

export function canRetryWithAlternateBaseUrl(error: unknown): boolean {
  return classifyProviderError(error).kind === "not_found";
}

export function formatProviderError(error: unknown): string | undefined {
  const facts = classifyProviderError(error);
  switch (facts.kind) {
    case "auth":
      return "API authentication failed. Check whether `KITTY_API_KEY` in the current project `.kitty/.env` is correct.";
    case "not_found":
      return "User-fixable error: provider endpoint returned 404. Check `KITTY_PROVIDER`, `KITTY_MODEL`, and `KITTY_BASE_URL` as one provider profile.";
    case "temporary":
      return "Environment error: network connection failed; the current provider/base URL is unreachable. Check network, proxy settings, or `KITTY_BASE_URL`.";
    case "rate_limit":
      return "Provider rate limit reached. Wait briefly, then retry.";
    case "server":
      return `Provider error: service returned ${facts.status ?? "a server error"}. Retry later or confirm the provider service is healthy.`;
    case "contract":
      return "Provider rejected the request contract. Check the selected provider/model profile and request options.";
    case "stream_framing":
      return "Provider stream ended before a complete response was received.";
    case "unknown":
      return undefined;
  }
}

export function readProviderRetryAfterMs(error: unknown): number | undefined {
  return classifyProviderError(error).retryAfterMs ?? readRetryAfterMs(error);
}

function readStatus(error: unknown): number | undefined {
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" && Number.isFinite(status) ? status : undefined;
}

function readCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown }).code;
  return typeof code === "string" && code ? code : undefined;
}

function readMessage(error: unknown): string {
  return String((error as { message?: unknown }).message ?? error);
}

function includesAny(value: string, fragments: readonly string[]): boolean {
  return fragments.some((fragment) => value.includes(fragment));
}

function isNetworkCode(code: string | undefined): boolean {
  return code !== undefined && [
    "ECONNRESET",
    "ECONNREFUSED",
    "ETIMEDOUT",
    "ENOTFOUND",
    "UND_ERR_CONNECT_TIMEOUT",
    "UND_ERR_HEADERS_TIMEOUT",
    "UND_ERR_SOCKET",
  ].includes(code);
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
  return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : undefined;
}

function readHeaderRecordValue(headers: unknown, key: string): string | undefined {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }
  const value = (headers as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}
