import type { Command } from "commander";

import {
  listEvaluationScenarios,
  listProductionEvaluationScenarios,
  runEvaluationChecks,
} from "../../evaluation/harness.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import type { EvaluationSuite } from "../../evaluation/types.js";

export function registerEvaluationCommand(
  program: Command,
  options: {
    getCwd?: () => string;
  } = {},
): void {
  program
    .command("eval")
    .description("List or run product acceptance scenarios.")
    .option("--json", "Print structured JSON.")
    .option("--run-local", "Run local deterministic evaluation checks.")
    .option("--run-production", "Run explicit production acceptance against the current project.")
    .action(async (commandOptions: { json?: boolean; runLocal?: boolean; runProduction?: boolean }) => {
      const suite = resolveEvaluationSuite(commandOptions);
      const scenarios = suite === "production"
        ? listProductionEvaluationScenarios()
        : listEvaluationScenarios();
      const result = suite
        ? await runEvaluationChecks(options.getCwd?.() ?? process.cwd(), suite)
        : undefined;

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify({ suite, scenarios, result }, null, 2));
        return;
      }

      if (suite === "production") {
        writeStdoutLine("Production evaluation explicitly requested.");
        writeStdoutLine("It uses the current project state and may consume the configured provider if production checks require it.");
        writeStdoutLine("");
      }

      writeStdoutLine(suite ? `Evaluation scenarios run (${suite}):` : "Evaluation scenarios:");
      for (const scenario of scenarios) {
        writeStdoutLine(`- ${scenario.id} [${scenario.suite}]: ${scenario.title}`);
        writeStdoutLine(`  用户路径: ${scenario.userPath}`);
        writeStdoutLine(`  机器证据: ${scenario.evidence}`);
      }
      if (result) {
        writeStdoutLine("");
        writeStdoutLine(`Status: ${result.status}`);
        for (const check of result.checks) {
          const scenario = scenarios.find((item) => item.id === check.id);
          writeStdoutLine(`${check.status} ${check.id}${scenario ? ` ${scenario.title}` : ""}: ${check.fact}${check.error ? ` (${check.error})` : ""}`);
        }
        if (result.status === "failed") {
          process.exitCode = 1;
        }
      }
    });
}

function resolveEvaluationSuite(options: {
  runLocal?: boolean;
  runProduction?: boolean;
}): EvaluationSuite | undefined {
  if (options.runProduction) {
    return "production";
  }
  if (options.runLocal) {
    return "local";
  }
  return undefined;
}
