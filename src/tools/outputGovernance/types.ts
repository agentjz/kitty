export type ToolOutputKind =
  | "empty"
  | "test"
  | "build"
  | "typecheck"
  | "search"
  | "git_diff"
  | "generic";

export type ToolOutputProjectionMode =
  | "empty"
  | "structured"
  | "generic";

export interface ToolOutputSource {
  toolName: string;
  command?: string;
  status?: string;
  exitCode?: number | null;
  durationMs?: number;
  output: string;
  outputPath?: string;
  truncated?: boolean;
  outputChars?: number;
  outputBytes?: number;
  recoveryHint?: string;
}

export interface ToolOutputGovernance {
  kind: ToolOutputKind;
  mode: ToolOutputProjectionMode;
  projection: string;
  rawChars: number;
  projectedChars: number;
  rawTokens: number;
  projectedTokens: number;
  savedTokens: number;
  savingsRatio: number;
  truncated: boolean;
  outputPath?: string;
  recoveryHint?: string;
  degraded: boolean;
  reason: string;
}
