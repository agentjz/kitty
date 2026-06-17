import { listEvaluationChecks, listEvaluationScenarios, runEvaluationCheck } from "./checks.js";
import type { EvaluationRunResult } from "./types.js";
import { summarizeChecks } from "./types.js";

export { listEvaluationChecks, listEvaluationScenarios } from "./checks.js";
export type { EvaluationCheckResult, EvaluationRunResult, EvaluationScenario } from "./types.js";

export async function runEvaluationChecks(rootDir: string): Promise<EvaluationRunResult> {
  const checks = await Promise.all(listEvaluationChecks().map((check) => runEvaluationCheck(check, rootDir)));
  return {
    status: summarizeChecks(checks),
    checks,
  };
}
