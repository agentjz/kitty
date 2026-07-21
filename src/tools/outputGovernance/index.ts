import { classifyToolOutput } from "./classifier.js";
import { computeSavings } from "./metrics.js";
import { appendRecoveryHint, projectOutputByKind } from "./projectors.js";
import type { ToolOutputGovernance, ToolOutputSource } from "./types.js";

export type { ToolOutputGovernance, ToolOutputKind, ToolOutputSource } from "./types.js";
export { estimateTextTokens } from "./metrics.js";

export function governToolOutput(source: ToolOutputSource): ToolOutputGovernance {
  const kind = classifyToolOutput(source);
  const projected = projectOutputByKind(kind, source);
  const artifactRecoveryHint = source.outputPath
    ? `[tool output truncated; this preview preserves the head and tail. Full output: ${source.outputPath}. Read a specific range only when the omitted facts are needed: {"path":${JSON.stringify(source.outputPath)}}]`
    : undefined;
  const recoveryHint = [source.recoveryHint, artifactRecoveryHint]
    .filter((hint): hint is string => Boolean(hint))
    .join("\n") || undefined;
  const projection = appendRecoveryHint(projected.projection, {
    outputPath: source.outputPath,
    recoveryHint,
  });
  const metrics = computeSavings({
    raw: source.output,
    projected: projection,
    rawChars: source.outputChars,
  });

  return {
    kind,
    mode: projected.mode,
    projection,
    rawChars: source.outputChars ?? metrics.rawChars,
    projectedChars: metrics.projectedChars,
    rawTokens: metrics.rawTokens,
    projectedTokens: metrics.projectedTokens,
    savedTokens: metrics.savedTokens,
    savingsRatio: metrics.savingsRatio,
    truncated: Boolean(source.truncated),
    outputPath: source.outputPath,
    recoveryHint,
    degraded: projected.degraded,
    reason: projected.reason,
  };
}
