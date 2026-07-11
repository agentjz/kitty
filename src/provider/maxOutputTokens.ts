export function normalizeProviderMaxOutputTokens(value: number, limit: number): number {
  return Math.max(1, Math.min(Math.trunc(value), limit));
}
