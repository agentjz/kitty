import { listEvaluationChecks, listEvaluationScenarios, runEvaluationCheck } from "./checks.js";
import {
  listProductionEvaluationChecks,
  listProductionEvaluationScenarios,
  runProductionEvaluationChecks,
} from "./production.js";
import type { EvaluationRunResult, EvaluationSuite } from "./types.js";
import { summarizeChecks } from "./types.js";

export {
  listEvaluationChecks,
  listEvaluationScenarios,
} from "./checks.js";
export {
  listProductionEvaluationChecks,
  listProductionEvaluationScenarios,
} from "./production.js";
export type {
  EvaluationCheckResult,
  EvaluationRunResult,
  EvaluationScenario,
  EvaluationSuite,
  ProductionEvaluationCheckId,
} from "./types.js";

export async function runEvaluationChecks(
  rootDir: string,
  suite: EvaluationSuite = "local",
): Promise<EvaluationRunResult> {
  if (suite === "production") {
    return runProductionEvaluationChecks(rootDir);
  }

  const checks = await Promise.all(listEvaluationChecks().map((check) => runEvaluationCheck(check, rootDir)));
  return {
    suite,
    status: summarizeChecks(checks),
    checks,
  };
}
