export function estimateTextTokens(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return 0;
  }
  return Math.max(1, Math.ceil(trimmed.length / 4));
}

export function computeSavings(input: {
  raw: string;
  projected: string;
  rawChars?: number;
}): {
  rawChars: number;
  projectedChars: number;
  rawTokens: number;
  projectedTokens: number;
  savedTokens: number;
  savingsRatio: number;
} {
  const rawChars = input.rawChars ?? input.raw.length;
  const projectedChars = input.projected.length;
  const rawTokens = input.rawChars === undefined
    ? estimateTextTokens(input.raw)
    : rawChars > 0 ? Math.max(1, Math.ceil(rawChars / 4)) : 0;
  const projectedTokens = estimateTextTokens(input.projected);
  const savedTokens = Math.max(0, rawTokens - projectedTokens);
  const savingsRatio = rawTokens > 0
    ? Math.round((savedTokens / rawTokens) * 10_000) / 10_000
    : 0;

  return {
    rawChars,
    projectedChars,
    rawTokens,
    projectedTokens,
    savedTokens,
    savingsRatio,
  };
}
