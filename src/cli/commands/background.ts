import type { Command } from "commander";

import { BackgroundExecutionStore, terminateBackgroundExecution, waitForBackgroundExecution, waitForRegisteredBackgroundProcess } from "../../execution/background.js";
import { readExecutionOutput } from "../../execution/output.js";
import { summarizeExecution } from "../../runtime/executionSummary.js";
import type { RuntimeExecutionSummary } from "../../runtime/statusTypes.js";
import { buildExecutionScene } from "../../runtime/scene.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../cliValues.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";

export function registerBackgroundCommand(
  program: Command,
  options: {
    locale: KittyLocale;
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      stateRootDir: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  const command = program
    .command("background")
    .description(translate(options.locale, "cli.command.background"));

  command
    .argument("[action]", translate(options.locale, "cli.argument.backgroundAction"))
    .argument("[id]", translate(options.locale, "cli.argument.backgroundId"))
    .option("--json", translate(options.locale, "cli.option.json"))
    .option("--timeout-ms <ms>", translate(options.locale, "cli.option.timeoutMs"), (value) => Number.parseInt(value, 10), 60_000)
    .option("--mode <mode>", translate(options.locale, "cli.option.readMode"), "tail")
    .option("--tail <lines>", translate(options.locale, "cli.option.tail"), (value) => Number.parseInt(value, 10), 80)
    .action(async (action: string | undefined, id: string | undefined, commandOptions: { json?: boolean; timeoutMs?: number; mode?: string; tail?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const normalizedAction = action ?? "list";

      if (normalizedAction === "list") {
        const executions = new BackgroundExecutionStore(runtime.stateRootDir)
          .listAll()
          .map(summarizeExecution)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        printBackgroundExecutions(executions, Boolean(commandOptions.json), runtime.config.locale);
        return;
      }

      if (!id) {
        throw new Error(translate(runtime.config.locale, "cli.background.idRequired", { action: normalizedAction }));
      }

      if (normalizedAction === "read") {
        const output = readExecutionOutput({
          rootDir: runtime.stateRootDir,
          id,
          kind: "background",
          mode: readOutputMode(commandOptions.mode),
          lines: commandOptions.tail,
        });
        printBackgroundOutput(output, Boolean(commandOptions.json));
        return;
      }

      if (normalizedAction === "wait") {
        const execution = summarizeExecution(await waitForBackgroundExecution({
          rootDir: runtime.stateRootDir,
          id,
          timeoutMs: commandOptions.timeoutMs,
        }));
        printBackgroundExecutions([execution], Boolean(commandOptions.json), runtime.config.locale);
        return;
      }

      if (normalizedAction === "stop") {
        const execution = terminateBackgroundExecution(runtime.stateRootDir, id);
        await waitForRegisteredBackgroundProcess(id);
        printBackgroundExecutions([summarizeExecution(execution)], Boolean(commandOptions.json), runtime.config.locale);
        return;
      }

      throw new Error(translate(runtime.config.locale, "cli.background.unknownAction", { action: normalizedAction }));
    });
}

function printBackgroundExecutions(executions: RuntimeExecutionSummary[], json: boolean, locale: KittyLocale): void {
  if (json) {
    writeStdoutLine(JSON.stringify({ executions }, null, 2));
    return;
  }
  if (executions.length === 0) {
    ui.info(translate(locale, "cli.background.none"));
    return;
  }
  for (const execution of executions) {
    writeStdoutLine(formatBackgroundExecution(execution, locale));
  }
}

export function formatBackgroundExecution(
  execution: RuntimeExecutionSummary,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  const scene = buildExecutionScene(execution);
  return [
    execution.id,
    execution.status,
    `${translate(locale, "status.label.risk")}=${scene.risk}`,
    execution.pid === undefined ? undefined : `${translate(locale, "status.label.pid")}=${execution.pid}`,
    `${translate(locale, "status.label.health")}=${truncateCliValue(scene.health, 90)}`,
    execution.deadlineAt ? `${translate(locale, "status.label.deadline")}=${execution.deadlineAt}` : undefined,
    `${translate(locale, "status.label.summary")}=${truncateCliValue(scene.summary, 90)}`,
    `${translate(locale, "status.label.next")}=${scene.nextAction}`,
    scene.lastOutput ? `${translate(locale, "status.label.lastOutput")}=${truncateCliValue(scene.lastOutput, 120)}` : undefined,
  ].filter(Boolean).join("  ");
}

function printBackgroundOutput(output: ReturnType<typeof readExecutionOutput>, json: boolean): void {
  if (json) {
    writeStdoutLine(JSON.stringify(output, null, 2));
    return;
  }
  writeStdoutLine(output.output);
}

function readOutputMode(value: unknown): "summary" | "tail" | "full" | undefined {
  return value === "summary" || value === "tail" || value === "full" ? value : undefined;
}
