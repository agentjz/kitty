export type EvaluationCheckId =
  | "runtime-status-builds"
  | "project-map-builds"
  | "context-epochs-readable"
  | "extension-surface-current"
  | "skill-packages-readable"
  | "config-preflight-readable"
  | "cache-economy-ready"
  | "tool-output-governance-ready"
  | "production-scene-ready"
  | "host-turn-boundary-runs"
  | "background-lifecycle-ready"
  | "remote-entrypoints-available"
  | "recovery-drills-pass";

export type ProductionEvaluationCheckId =
  | "production-config-preflight"
  | "production-provider-probe"
  | "production-real-turn"
  | "production-tool-turn"
  | "production-runtime-status";

export type EvaluationSuite = "local" | "production";

export interface EvaluationRunResult {
  suite: EvaluationSuite;
  status: "passed" | "failed" | "skipped";
  checks: EvaluationCheckResult[];
}

export interface EvaluationScenario {
  id: EvaluationCheckId | ProductionEvaluationCheckId;
  suite: EvaluationSuite;
  title: string;
  userPath: string;
  evidence: string;
}

export interface EvaluationCheckResult {
  id: EvaluationCheckId | ProductionEvaluationCheckId;
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
