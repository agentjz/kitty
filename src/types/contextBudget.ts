export interface ContextBudgetReport {
  version: 1;
  limitChars: number;
  estimatedChars: number;
  remainingChars: number;
  usageRatio: number;
  compressed: boolean;
  compressionMode: "none" | "normal" | "aggressive" | "hard";
  compressionReason: string;
  promptHotspots: ContextBudgetHotspot[];
}

export interface ContextBudgetHotspot {
  layer: "static" | "profile" | "runtimeFacts";
  title: string;
  chars: number;
  lines: number;
}
