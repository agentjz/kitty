import type { ProjectionResult } from "../projection.js";
import type { ToolOutputSource } from "../types.js";
import { buildHeader } from "./shared.js";

export function projectEmptyOutput(source: ToolOutputSource): ProjectionResult {
  const successful = source.exitCode === 0 || source.status === "completed";
  return {
    mode: "empty",
    projection: [
      buildHeader(source, successful ? "completed successfully" : "completed without output"),
      successful ? "stdout and stderr were empty; no result content is missing." : "stdout and stderr were empty.",
    ].join("\n"),
    degraded: false,
    reason: "empty_output",
  };
}

export function projectGenericOutput(
  source: ToolOutputSource,
  reason = "verbatim_output",
  label = "output",
  mode: ProjectionResult["mode"] = "generic",
): ProjectionResult {
  return {
    mode,
    projection: [buildHeader(source, label), source.output.trim()].filter(Boolean).join("\n"),
    degraded: false,
    reason,
  };
}
