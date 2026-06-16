export interface ProviderUsageSnapshot {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  cacheHitTokens?: number;
  cacheMissTokens?: number;
  cacheHitRate?: number;
}

export interface ModelRequestMetric {
  durationMs: number;
  usage?: ProviderUsageSnapshot;
}
