import type { ProjectionResult } from "./projection.js";
import type { ToolOutputKind, ToolOutputSource } from "./types.js";
import { buildDiagnosticProjection } from "./projectors/diagnostic.js";
import { buildGitDiffProjection } from "./projectors/gitDiff.js";
import { projectEmptyOutput, projectGenericOutput, projectStructuredOutput } from "./projectors/generic.js";
import { buildSearchProjection } from "./projectors/search.js";
export { appendRecoveryHint } from "./projectors/recovery.js";

export function projectOutputByKind(kind: ToolOutputKind, source: ToolOutputSource): ProjectionResult {
  switch (kind) {
    case "empty":
      return projectEmptyOutput(source);
    case "test":
      return projectStructuredOutput(source, buildDiagnosticProjection(source, "test"));
    case "build":
      return projectStructuredOutput(source, buildDiagnosticProjection(source, "build"));
    case "typecheck":
      return projectStructuredOutput(source, buildDiagnosticProjection(source, "typecheck"));
    case "search":
      return projectStructuredOutput(source, buildSearchProjection(source));
    case "git_diff":
      return projectStructuredOutput(source, buildGitDiffProjection(source));
    case "generic":
      return projectGenericOutput(source);
  }
}
