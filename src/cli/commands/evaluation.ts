import type { Command } from "commander";

import { listEvaluationScenarios, runEvaluationScenarios } from "../../evaluation/harness.js";
import { writeStdoutLine } from "../../utils/stdio.js";

export function registerEvaluationCommand(
  program: Command,
  options: {
    getCwd?: () => string;
  } = {},
): void {
  program
    .command("eval")
    .description("List or run real agent experience evaluation scenarios.")
    .option("--json", "Print structured JSON.")
    .option("--run", "Run local machine-verifiable evaluation checks.")
    .action(async (commandOptions: { json?: boolean; run?: boolean }) => {
      const scenarios = listEvaluationScenarios();
      const results = commandOptions.run
        ? await runEvaluationScenarios(options.getCwd?.() ?? process.cwd())
        : undefined;

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify({ scenarios, results }, null, 2));
        return;
      }

      writeStdoutLine(commandOptions.run ? "Evaluation run:" : "Evaluation scenarios:");
      for (const scenario of scenarios) {
        const result = results?.find((item) => item.scenarioId === scenario.id);
        writeStdoutLine("");
        writeStdoutLine(result ? `${scenario.id}  ${result.status}` : scenario.id);
        writeStdoutLine(`  User experience: ${scenario.userExperience}`);
        writeStdoutLine(`  Machine facts: ${scenario.machineFacts.join(" | ")}`);
        writeStdoutLine(`  Acceptance: ${scenario.acceptance.join(" | ")}`);
        if (result) {
          for (const check of result.checks) {
            writeStdoutLine(`  ${check.status}: ${check.fact}${check.error ? ` (${check.error})` : ""}`);
          }
        }
      }
    });
}
