export type EvaluationCheckId =
  | "runtime-status-builds"
  | "project-map-builds"
  | "memory-assets-readable"
  | "extension-surface-current"
  | "skill-packages-readable"
  | "config-preflight-readable"
  | "cache-economy-ready"
  | "production-scene-ready"
  | "host-turn-boundary-runs"
  | "remote-entrypoints-available"
  | "recovery-drills-pass";

export interface EvaluationRunResult {
  status: "passed" | "failed" | "skipped";
  checks: EvaluationCheckResult[];
}

export interface EvaluationScenario {
  id: EvaluationCheckId;
  title: string;
  userPath: string;
  evidence: string;
}

export interface EvaluationCheckResult {
  id: EvaluationCheckId;
  status: "passed" | "failed" | "skipped";
  fact: string;
  error?: string;
}

export function passed(id: EvaluationCheckResult["id"], fact: string): EvaluationCheckResult {
  return {
    id,
    status: "passed",
    fact,
  };
}

export function summarizeChecks(checks: readonly EvaluationCheckResult[]): EvaluationRunResult["status"] {
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }
  if (checks.some((check) => check.status === "skipped")) {
    return "skipped";
  }
  return "passed";
}
