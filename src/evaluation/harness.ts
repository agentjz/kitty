import { runEvaluationCheck } from "./checks.js";
import { runGoldenEvaluationScenario } from "./golden.js";
import { listEvaluationScenarios } from "./scenarios.js";
import type { EvaluationCheckId, EvaluationCheckResult, EvaluationRunResult } from "./types.js";
import { summarizeChecks } from "./types.js";

export { listEvaluationScenarios } from "./scenarios.js";
export type {
  EvaluationCheckId,
  EvaluationCheckResult,
  EvaluationRunResult,
  EvaluationScenario,
  GoldenEvaluationCheckId,
  GoldenEvaluationScenarioId,
} from "./types.js";

export async function runEvaluationScenarios(rootDir: string): Promise<EvaluationRunResult[]> {
  const scenarios = listEvaluationScenarios();
  const cache = new Map<EvaluationCheckId, Promise<EvaluationCheckResult>>();
  return Promise.all(scenarios.map(async (scenario) => {
    const checks = await Promise.all(scenario.checks.map((check) => {
      const existing = cache.get(check);
      if (existing) {
        return existing;
      }
      const pending = runEvaluationCheck(check, rootDir);
      cache.set(check, pending);
      return pending;
    }));
    const golden = scenario.golden ? await runGoldenEvaluationScenario(rootDir, scenario.golden) : undefined;
    const allChecks = golden ? [...checks, ...golden.checks] : checks;
    return {
      scenarioId: scenario.id,
      status: summarizeChecks(allChecks),
      checks: allChecks,
      sessionId: golden?.sessionId,
    };
  }));
}
