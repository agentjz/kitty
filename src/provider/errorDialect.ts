import type { ProviderErrorPolicy } from "./catalog.js";

const ZHIPU_RETRYABLE_LIMIT_CODES = new Set(["1302", "1303", "1305", "1312"]);
const ZHIPU_TERMINAL_LIMIT_CODES = new Set(["1304", "1308", "1309", "1310", "1311", "1313"]);

export function resolveRateLimitRetryability(
  policy: ProviderErrorPolicy,
  code: string | undefined,
  error?: unknown,
): boolean | undefined {
  if (policy === "google") {
    const quotaIds = readGoogleQuotaIds(error);
    if (quotaIds.some((quotaId) => /PerDay|RequestsPerDay|TokensPerDay/u.test(quotaId))) {
      return false;
    }
    if (quotaIds.some((quotaId) => /PerMinute|RequestsPerMinute|TokensPerMinute/u.test(quotaId))) {
      return true;
    }
    return readGoogleRetryDelayMs(error) === undefined ? undefined : true;
  }
  if (policy !== "zhipu" || !code) {
    return undefined;
  }
  if (ZHIPU_RETRYABLE_LIMIT_CODES.has(code)) {
    return true;
  }
  if (ZHIPU_TERMINAL_LIMIT_CODES.has(code)) {
    return false;
  }
  return undefined;
}

export function readGoogleRetryDelayMs(error: unknown): number | undefined {
  const retryInfo = readGoogleDetails(error).find((detail) =>
    readType(detail).endsWith("google.rpc.RetryInfo"));
  if (!retryInfo) {
    return undefined;
  }
  const delay = retryInfo.retryDelay;
  if (typeof delay === "string") {
    const match = /^(\d+(?:\.\d+)?)s$/u.exec(delay.trim());
    return match ? Math.max(0, Math.round(Number(match[1]) * 1_000)) : undefined;
  }
  if (isRecord(delay)) {
    const seconds = Number(delay.seconds ?? 0);
    const nanos = Number(delay.nanos ?? 0);
    if (Number.isFinite(seconds) && Number.isFinite(nanos) && seconds >= 0 && nanos >= 0) {
      return Math.round((seconds * 1_000) + (nanos / 1_000_000));
    }
  }
  return undefined;
}

function readGoogleQuotaIds(error: unknown): string[] {
  return readGoogleDetails(error)
    .filter((detail) => readType(detail).endsWith("google.rpc.QuotaFailure"))
    .flatMap((detail) => Array.isArray(detail.violations) ? detail.violations : [])
    .flatMap((violation) => isRecord(violation) && typeof violation.quotaId === "string"
      ? [violation.quotaId]
      : []);
}

function readGoogleDetails(error: unknown): Record<string, unknown>[] {
  const root = isRecord(error) && isRecord(error.error) ? error.error : error;
  return isRecord(root) && Array.isArray(root.details)
    ? root.details.filter(isRecord)
    : [];
}

function readType(value: Record<string, unknown>): string {
  return typeof value["@type"] === "string" ? value["@type"] : "";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
