import type { ProviderUsageSnapshot } from "./metrics.js";

export function normalizeProviderUsage(usage: unknown): ProviderUsageSnapshot | undefined {
  if (!usage || typeof usage !== "object") {
    return undefined;
  }

  const record = usage as Record<string, unknown>;
  const promptDetails = readObject(record.prompt_tokens_details);
  const completionDetails = readObject(record.completion_tokens_details);
  const outputDetails = readObject(record.output_tokens_details);

  const inputTokens = readUsageNumber(record.prompt_tokens ?? record.input_tokens);
  const outputTokens = readUsageNumber(record.completion_tokens ?? record.output_tokens);
  const totalTokens = readUsageNumber(record.total_tokens);
  const reasoningTokens = readUsageNumber(
    completionDetails?.reasoning_tokens ??
    outputDetails?.reasoning_tokens,
  );

  const deepSeekHitTokens = readUsageNumber(record.prompt_cache_hit_tokens);
  const deepSeekMissTokens = readUsageNumber(record.prompt_cache_miss_tokens);
  const cacheReadTokens = readUsageNumber(promptDetails?.cached_tokens);
  const cacheHitTokens = firstNumber(deepSeekHitTokens, cacheReadTokens);
  const cacheMissTokens = deepSeekMissTokens;

  const snapshot: ProviderUsageSnapshot = {
    inputTokens,
    outputTokens,
    totalTokens,
    reasoningTokens,
    cacheReadTokens,
    cacheHitTokens,
    cacheMissTokens,
  };
  const cacheHitRate = computeCacheHitRate(snapshot);
  if (cacheHitRate !== undefined) {
    snapshot.cacheHitRate = cacheHitRate;
  }

  return Object.values(snapshot).some((value) => typeof value === "number") ? snapshot : undefined;
}

export function hasProviderUsageSnapshot(usage: ProviderUsageSnapshot | undefined): boolean {
  return Boolean(usage && Object.values(usage).some((value) => typeof value === "number"));
}

function computeCacheHitRate(snapshot: Pick<
  ProviderUsageSnapshot,
  "inputTokens" | "cacheReadTokens" | "cacheCreationTokens" | "cacheHitTokens" | "cacheMissTokens"
>): number | undefined {
  if (typeof snapshot.cacheHitTokens === "number" && typeof snapshot.cacheMissTokens === "number") {
    return ratio(snapshot.cacheHitTokens, snapshot.cacheHitTokens + snapshot.cacheMissTokens);
  }

  if (typeof snapshot.cacheReadTokens === "number") {
    const denominator =
      (snapshot.inputTokens ?? 0) +
      snapshot.cacheReadTokens +
      (snapshot.cacheCreationTokens ?? 0);
    return ratio(snapshot.cacheReadTokens, denominator);
  }

  return undefined;
}

function ratio(numerator: number, denominator: number): number | undefined {
  if (denominator <= 0) {
    return undefined;
  }

  return Math.round((numerator / denominator) * 10_000) / 10_000;
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function firstNumber(...values: Array<number | undefined>): number | undefined {
  return values.find((value) => typeof value === "number");
}

function readUsageNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : undefined;
}
