import type { ProjectionResult } from "./projection.js";
import type { ToolOutputKind, ToolOutputSource } from "./types.js";
import { projectEmptyOutput, projectGenericOutput } from "./projectors/generic.js";
export { appendRecoveryHint } from "./projectors/recovery.js";

export function projectOutputByKind(kind: ToolOutputKind, source: ToolOutputSource): ProjectionResult {
  switch (kind) {
    case "empty":
      return projectEmptyOutput(source);
    case "test":
      return projectGenericOutput(source, "verbatim_test_output", "test", "structured");
    case "build":
      return projectGenericOutput(source, "verbatim_build_output", "build", "structured");
    case "typecheck":
      return projectGenericOutput(source, "verbatim_typecheck_output", "typecheck", "structured");
    case "search":
      return projectGenericOutput(source, "verbatim_search_output", "search", "structured");
    case "git_diff":
      return projectGenericOutput(source, "verbatim_git_diff_output", "git diff", "structured");
    case "generic":
      return projectGenericOutput(source);
  }
}
