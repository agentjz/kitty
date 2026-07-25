import type { SessionDiffChange } from "./session.js";
import type { ToolDiagnosticsReport } from "./diagnostics.js";
import type { ToolOutputGovernance } from "../tools/outputGovernance/index.js";

export interface ToolExecutionMetadata {
  external?: {
    operationId: string;
    dispatchState: "dispatched" | "settled";
    outcome?: "uncertain";
  };
  artifacts?: Array<{
    kind: "file";
    path: string;
    bytes?: number;
    mimeType?: string;
  }>;
  changedPaths?: string[];
  changeId?: string;
  runtime?: {
    status: "completed" | "failed" | "timed_out" | "stalled" | "aborted";
    exitCode: number | null;
    durationMs: number;
    attempts: number;
    timedOut: boolean;
    stalled: boolean;
    aborted: boolean;
    truncated: boolean;
    outputPath?: string;
    outputPreview: string;
  };
  outputGovernance?: ToolOutputGovernance;
  diff?: string;
  diagnostics?: ToolDiagnosticsReport;
  sessionDiff?: SessionDiffChange;
}

export interface ToolExecutionResult {
  ok: boolean;
  output: string;
  metadata?: ToolExecutionMetadata;
}
