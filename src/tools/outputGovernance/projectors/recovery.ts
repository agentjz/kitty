import type { ToolOutputGovernance } from "../types.js";

export function appendRecoveryHint(
  projection: string,
  governance: Pick<ToolOutputGovernance, "outputPath" | "recoveryHint">,
): string {
  if (!governance.recoveryHint) {
    return projection;
  }
  if (projection.includes(governance.recoveryHint)) {
    return projection;
  }
  return `${projection.trimEnd()}\n${governance.recoveryHint}`;
}
