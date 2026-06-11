import type { PromptBlockMetric } from "../../agent/prompt/types.js";
import type { ContextBudgetReport } from "../../types/contextBudget.js";

export function buildContextBudgetReport(input: {
  limitChars: number;
  estimatedChars: number;
  compressed: boolean;
  summary?: string;
  promptHotspots?: readonly PromptBlockMetric[];
  compressionMode?: ContextBudgetReport["compressionMode"];
}): ContextBudgetReport {
  const limitChars = Math.max(1, Math.trunc(input.limitChars));
  const estimatedChars = Math.max(0, Math.trunc(input.estimatedChars));
  const remainingChars = limitChars - estimatedChars;
  return {
    version: 1,
    limitChars,
    estimatedChars,
    remainingChars,
    usageRatio: Number((estimatedChars / limitChars).toFixed(4)),
    compressed: input.compressed,
    compressionMode: input.compressionMode ?? (input.compressed ? "normal" : "none"),
    compressionReason: readCompressionReason(input),
    promptHotspots: (input.promptHotspots ?? []).slice(0, 5).map((hotspot) => ({
      layer: hotspot.layer,
      title: hotspot.title,
      chars: hotspot.chars,
      lines: hotspot.lines,
    })),
  };
}

function readCompressionReason(input: {
  compressed: boolean;
  summary?: string;
  compressionMode?: ContextBudgetReport["compressionMode"];
}): string {
  if (!input.compressed) {
    return "within_budget";
  }
  if (input.compressionMode === "hard") {
    return "hard_tail_compaction";
  }
  if (input.compressionMode === "aggressive") {
    return "aggressive_tail_compaction";
  }
  return input.summary ? "summary_and_tail_compaction" : "tail_compaction";
}
