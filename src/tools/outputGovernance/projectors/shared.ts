import type { ToolOutputSource } from "../types.js";

export function buildHeader(source: ToolOutputSource, label: string): string {
  return [
    `${source.toolName}: ${label}`,
    source.exitCode === undefined ? undefined : `exit=${source.exitCode ?? "null"}`,
    source.durationMs === undefined ? undefined : `duration=${source.durationMs}ms`,
    source.status ? `status=${source.status}` : undefined,
  ].filter(Boolean).join("  ");
}
