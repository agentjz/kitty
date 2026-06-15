import type { Command } from "commander";

import { listEvaluationChecks, runEvaluationChecks } from "../../evaluation/harness.js";
import { writeStdoutLine } from "../../utils/stdio.js";

export function registerEvaluationCommand(
  program: Command,
  options: {
    getCwd?: () => string;
  } = {},
): void {
  program
    .command("eval")
    .description("List or run machine-verifiable evaluation checks.")
    .option("--json", "Print structured JSON.")
    .option("--run", "Run all local evaluation checks.")
    .action(async (commandOptions: { json?: boolean; run?: boolean }) => {
      const checks = listEvaluationChecks();
      const result = commandOptions.run
        ? await runEvaluationChecks(options.getCwd?.() ?? process.cwd())
        : undefined;

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify({ checks, result }, null, 2));
        return;
      }

      writeStdoutLine(commandOptions.run ? "Evaluation checks run:" : "Evaluation checks:");
      for (const check of checks) {
        writeStdoutLine(`- ${check}`);
      }
      if (result) {
        writeStdoutLine("");
        writeStdoutLine(`Status: ${result.status}`);
        for (const check of result.checks) {
          writeStdoutLine(`${check.status} ${check.id}: ${check.fact}${check.error ? ` (${check.error})` : ""}`);
        }
      }
    });
}
