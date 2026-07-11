export type ToolResultStatus = "success" | "error";

export type ToolResultFactValue = string | number | boolean | null | string[];

export interface ToolResultRecoveryAction {
  tool: string;
  arguments: Record<string, string | number | boolean>;
}

export interface ToolResultArtifact {
  kind: "command_output" | "file" | "diff" | "trace";
  path: string;
  chars?: number;
  bytes?: number;
  recovery?: ToolResultRecoveryAction;
}

export interface ToolResultProvenance {
  cwd?: string;
  command?: string;
  targetPath?: string;
  startLine?: number;
  endLine?: number;
  executionId?: string;
}

export interface ToolResultTruncation {
  truncated: boolean;
  strategy: "none" | "head_tail" | "structured" | "artifact";
  originalChars?: number;
  projectedChars: number;
  omittedChars?: number;
}

export interface ToolResultErrorEvidence {
  code?: string;
  message: string;
  recoveryHint?: string;
}

export interface ToolResultEnvelope {
  callId: string;
  toolName: string;
  status: ToolResultStatus;
  summary: string;
  modelView: string;
  compactView: string;
  provenance?: ToolResultProvenance;
  facts: Record<string, ToolResultFactValue>;
  error?: ToolResultErrorEvidence;
  artifacts: ToolResultArtifact[];
  truncation: ToolResultTruncation;
}
