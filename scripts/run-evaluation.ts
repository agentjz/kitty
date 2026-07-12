import {
  listEvaluationScenarios,
  listProductionEvaluationScenarios,
  runEvaluationChecks,
} from "../src/evaluation/harness.js";
import type { EvaluationSuite } from "../src/evaluation/types.js";

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

async function main(): Promise<void> {
  const suite = readSuite(process.argv[2]);
  const scenarios = suite === "production"
    ? listProductionEvaluationScenarios()
    : listEvaluationScenarios();
  const result = await runEvaluationChecks(process.cwd(), suite);

  for (const check of result.checks) {
    const scenario = scenarios.find((item) => item.id === check.id);
    console.log(`${check.status} ${check.id}${scenario ? ` ${scenario.title}` : ""}: ${check.fact}${check.error ? ` (${check.error})` : ""}`);
  }
  console.log(`Evaluation ${suite}: ${result.status}`);
  if (result.status === "failed") process.exitCode = 1;
}

function readSuite(value: string | undefined): EvaluationSuite {
  if (value === "local" || value === "production") return value;
  throw new Error("Usage: tsx scripts/run-evaluation.ts <local|production>");
}
