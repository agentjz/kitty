import type { Command } from "commander";

import { cancelExecution } from "../../execution/lifecycle.js";
import { unknownExecution } from "../../execution/errors.js";
import { readExecutionOutput } from "../../execution/output.js";
import { ExecutionStore } from "../../execution/store.js";
import { summarizeExecution } from "../../runtime/executionSummary.js";
import type { RuntimeExecutionSummary } from "../../runtime/statusTypes.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../cliValues.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";

export function registerExecutionCommand(
  program: Command,
  options: {
    locale: KittyLocale;
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      stateRootDir?: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  const command = program
    .command("execution")
    .description(translate(options.locale, "cli.command.execution"));

  command
    .command("list")
    .option("--json", translate(options.locale, "cli.option.json"))
    .action(async (commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const executions = new ExecutionStore(readStateRoot(runtime))
        .list()
        .map(summarizeExecution)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      printExecutionList(executions, Boolean(commandOptions.json), runtime.config.locale);
    });

  command
    .command("inspect")
    .description(translate(options.locale, "cli.command.executionInspect"))
    .argument("<id>", translate(options.locale, "cli.argument.executionId"))
    .option("--json", translate(options.locale, "cli.option.json"))
    .action(async (id: string, commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const execution = new ExecutionStore(readStateRoot(runtime)).load(id);
      if (!execution) {
        throw unknownExecution(id);
      }
      printExecutionList([summarizeExecution(execution)], Boolean(commandOptions.json), runtime.config.locale);
    });

  command
    .command("read")
    .description(translate(options.locale, "cli.command.executionRead"))
    .argument("<id>", translate(options.locale, "cli.argument.executionId"))
    .option("--json", translate(options.locale, "cli.option.json"))
    .option("--mode <mode>", translate(options.locale, "cli.option.readMode"), "tail")
    .option("--tail <lines>", translate(options.locale, "cli.option.tail"), (value) => Number.parseInt(value, 10), 80)
    .action(async (id: string, commandOptions: { json?: boolean; mode?: string; tail?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const output = readExecutionOutput({
        rootDir: readStateRoot(runtime),
        id,
        mode: readOutputMode(commandOptions.mode),
        lines: commandOptions.tail,
      });
      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify(output, null, 2));
        return;
      }
      writeStdoutLine(output.output);
    });

  command
    .command("cancel")
    .description(translate(options.locale, "cli.command.executionCancel"))
    .argument("<id>", translate(options.locale, "cli.argument.executionId"))
    .option("--json", translate(options.locale, "cli.option.json"))
    .action(async (id: string, commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const execution = cancelExecution(readStateRoot(runtime), id, {
        terminatedBy: "cli",
      });
      printExecutionList([summarizeExecution(execution)], Boolean(commandOptions.json), runtime.config.locale);
    });
}

function printExecutionList(executions: RuntimeExecutionSummary[], json: boolean, locale: KittyLocale): void {
  if (json) {
    writeStdoutLine(JSON.stringify({ executions }, null, 2));
    return;
  }
  if (executions.length === 0) {
    ui.info(translate(locale, "cli.execution.none"));
    return;
  }
  for (const execution of executions) {
    writeStdoutLine(formatExecutionLine(execution, locale));
  }
}

function formatExecutionLine(execution: RuntimeExecutionSummary, locale: KittyLocale = DEFAULT_LOCALE): string {
  return [
    execution.id,
    execution.kind,
    execution.status,
    execution.actorName ? `${translate(locale, "status.label.actor")}=${execution.actorName}` : undefined,
    execution.pid === undefined ? undefined : `${translate(locale, "status.label.pid")}=${execution.pid}`,
    execution.deadlineAt ? `${translate(locale, "status.label.deadline")}=${execution.deadlineAt}` : undefined,
    execution.summary ? `${translate(locale, "status.label.summary")}=${truncateCliValue(execution.summary, 90)}` : undefined,
    execution.outputPreview ? `${translate(locale, "status.label.lastOutput")}=${truncateCliValue(execution.outputPreview, 120)}` : undefined,
  ].filter(Boolean).join("  ");
}

function readStateRoot(runtime: { cwd: string; stateRootDir?: string }): string {
  return runtime.stateRootDir ?? runtime.cwd;
}

function readOutputMode(value: unknown): "summary" | "tail" | "full" | undefined {
  return value === "summary" || value === "tail" || value === "full" ? value : undefined;
}
