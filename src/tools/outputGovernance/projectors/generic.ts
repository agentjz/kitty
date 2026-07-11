import type { ProjectionResult } from "../projection.js";
import type { ToolOutputSource } from "../types.js";
import { buildHeadTailPreview, buildHeader } from "./shared.js";

const GENERIC_MAX_CHARS = 1_500;

export function projectEmptyOutput(source: ToolOutputSource): ProjectionResult {
  return {
    mode: "empty",
    projection: buildHeader(source, "no output"),
    degraded: false,
    reason: "empty_output",
  };
}

export function projectGenericOutput(source: ToolOutputSource, reason = "generic_output"): ProjectionResult {
  return {
    mode: "generic",
    projection: buildGenericPreview(source),
    degraded: false,
    reason,
  };
}

export function projectStructuredOutput(
  source: ToolOutputSource,
  body: string,
): ProjectionResult {
  const trimmed = body.trim();
  if (!trimmed) {
    return {
      mode: "generic",
      projection: buildGenericPreview(source),
      degraded: true,
      reason: "structured_projection_empty",
    };
  }

  return {
    mode: "structured",
    projection: trimmed,
    degraded: false,
    reason: "structured_projection",
  };
}

function buildGenericPreview(source: ToolOutputSource): string {
  return [
    buildHeader(source, "output"),
    buildHeadTailPreview(source.output, GENERIC_MAX_CHARS),
  ].filter(Boolean).join("\n");
}
