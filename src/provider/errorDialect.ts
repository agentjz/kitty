import type { ProviderErrorPolicy } from "./catalog.js";

const ZHIPU_RETRYABLE_LIMIT_CODES = new Set(["1302", "1303", "1305", "1312"]);
const ZHIPU_TERMINAL_LIMIT_CODES = new Set(["1304", "1308", "1309", "1310", "1311", "1313"]);

export function resolveRateLimitRetryability(
  policy: ProviderErrorPolicy,
  code: string | undefined,
): boolean | undefined {
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
