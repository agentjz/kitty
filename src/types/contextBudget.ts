export interface ContextBudgetReport {
  limitChars: number;
  estimatedChars: number;
  remainingChars: number;
  usageRatio: number;
  compressed: boolean;
  compressionMode: "none" | "normal" | "aggressive" | "hard";
  compressionReason: string;
  sources: ContextBudgetSource[];
  promptHotspots: ContextBudgetHotspot[];
  cacheLayout?: ContextCacheLayoutReport;
}

export interface ContextBudgetSource {
  name: "systemPrompt" | "nearFieldConversation" | "conversationSummary" | "compactedConversation";
  chars: number;
  messages?: number;
}

export interface ContextBudgetHotspot {
  layer: "static" | "profile" | "runtimeFacts";
  title: string;
  chars: number;
  lines: number;
}

export interface ContextCacheLayoutReport {
  stablePrefixFingerprint: string;
  volatileTailFingerprint: string;
  stablePrefixChars: number;
  volatileTailChars: number;
  stableSources: string[];
  volatileSources: string[];
}
