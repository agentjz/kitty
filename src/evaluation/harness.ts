import { listEvaluationChecks, listEvaluationScenarios, runEvaluationCheck } from "./checks.js";
import {
  listProductionEvaluationChecks,
  listProductionEvaluationScenarios,
  runProductionEvaluationChecks,
} from "./production.js";
import type { EvaluationRunResult, EvaluationSuite } from "./types.js";
import { summarizeChecks } from "./types.js";
import { cleanupCheckWorkspaces } from "./workspace.js";

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
  try {
    if (suite === "production") {
      return await runProductionEvaluationChecks(rootDir);
    }

    const checks = await Promise.all(listEvaluationChecks().map((check) => runEvaluationCheck(check, rootDir)));
    return {
      suite,
      status: summarizeChecks(checks),
      checks,
    };
  } finally {
    await cleanupCheckWorkspaces(rootDir);
  }
}
