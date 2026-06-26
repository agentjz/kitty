import type { ToolOutputProjectionMode } from "./types.js";

export interface ProjectionResult {
  mode: ToolOutputProjectionMode;
  projection: string;
  degraded: boolean;
  reason: string;
}
