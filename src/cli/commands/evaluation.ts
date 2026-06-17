import type { Command } from "commander";

import { listEvaluationScenarios, runEvaluationChecks } from "../../evaluation/harness.js";
import { writeStdoutLine } from "../../utils/stdio.js";

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
    .option("--run", "Run all local evaluation checks.")
    .action(async (commandOptions: { json?: boolean; run?: boolean }) => {
      const scenarios = listEvaluationScenarios();
      const result = commandOptions.run
        ? await runEvaluationChecks(options.getCwd?.() ?? process.cwd())
        : undefined;

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify({ scenarios, result }, null, 2));
        return;
      }

      writeStdoutLine(commandOptions.run ? "Evaluation scenarios run:" : "Evaluation scenarios:");
      for (const scenario of scenarios) {
        writeStdoutLine(`- ${scenario.id}: ${scenario.title}`);
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
      }
    });
}
