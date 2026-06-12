export interface EvaluationScenario {
  id: string;
  userExperience: string;
  machineFacts: string[];
  acceptance: string[];
  checks: EvaluationCheckId[];
  golden?: GoldenEvaluationScenarioId;
}

export type EvaluationCheckId =
  | "runtime-status-builds"
  | "project-map-builds"
  | "memory-assets-readable"
  | "extension-surface-current"
  | "spec-store-available"
  | "skill-packages-readable"
  | "config-preflight-readable";

export interface EvaluationRunResult {
  scenarioId: string;
  status: "passed" | "failed" | "skipped";
  checks: EvaluationCheckResult[];
  sessionId?: string;
}

export interface EvaluationCheckResult {
  id: EvaluationCheckId | GoldenEvaluationCheckId;
  status: "passed" | "failed" | "skipped";
  fact: string;
  error?: string;
}

export type GoldenEvaluationScenarioId =
  | "simple-question-stays-small"
  | "tool-read-records-workset"
  | "edit-records-workset-and-change";

export type GoldenEvaluationCheckId =
  | `golden:${GoldenEvaluationScenarioId}:turn`
  | `golden:${GoldenEvaluationScenarioId}:workset`
  | `golden:${GoldenEvaluationScenarioId}:events`;

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
