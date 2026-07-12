import type { Command } from "commander";

import {
  listEvaluationScenarios,
  listProductionEvaluationScenarios,
  runEvaluationChecks,
} from "../../evaluation/harness.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import type { EvaluationSuite } from "../../evaluation/types.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerEvaluationCommand(
  program: Command,
  options: {
    getCwd?: () => string;
    locale?: KittyLocale;
  } = {},
): void {
  const locale = options.locale ?? "zh-CN";
  program
    .command("eval")
    .description(translate(locale, "cli.command.eval"))
    .option("--json", translate(locale, "cli.option.json"))
    .option("--run-local", translate(locale, "cli.option.runLocal"))
    .option("--run-production", translate(locale, "cli.option.runProduction"))
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
        writeStdoutLine(translate(locale, "cli.eval.productionNotice"));
        writeStdoutLine(translate(locale, "cli.eval.productionCost"));
        writeStdoutLine("");
      }

      writeStdoutLine(suite
        ? translate(locale, "cli.eval.scenariosRun", { suite })
        : translate(locale, "cli.eval.scenarios"));
      for (const scenario of scenarios) {
        writeStdoutLine(`- ${scenario.id} [${scenario.suite}]: ${scenario.title}`);
        writeStdoutLine(`  ${translate(locale, "cli.eval.userPath")}: ${scenario.userPath}`);
        writeStdoutLine(`  ${translate(locale, "cli.eval.evidence")}: ${scenario.evidence}`);
      }
      if (result) {
        writeStdoutLine("");
        writeStdoutLine(translate(locale, "cli.eval.status", { status: result.status }));
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
