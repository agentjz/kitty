import type { Command } from "commander";

import { listEvaluationScenarios } from "../../evaluation/harness.js";
import { writeStdoutLine } from "../../utils/stdio.js";

export function registerEvaluationCommand(program: Command): void {
  program
    .command("eval")
    .description("List real agent experience evaluation scenarios.")
    .option("--json", "Print structured JSON.")
    .action((options: { json?: boolean }) => {
      const scenarios = listEvaluationScenarios();
      if (options.json) {
        writeStdoutLine(JSON.stringify({ scenarios }, null, 2));
        return;
      }

      writeStdoutLine("Evaluation scenarios:");
      for (const scenario of scenarios) {
        writeStdoutLine("");
        writeStdoutLine(`${scenario.id}`);
        writeStdoutLine(`  User experience: ${scenario.userExperience}`);
        writeStdoutLine(`  Machine facts: ${scenario.machineFacts.join(" | ")}`);
        writeStdoutLine(`  Acceptance: ${scenario.acceptance.join(" | ")}`);
      }
    });
}
