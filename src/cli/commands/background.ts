import type { Command } from "commander";

import { BackgroundExecutionStore, readBackgroundExecutionOutput, terminateBackgroundExecution, waitForBackgroundExecution, waitForRegisteredBackgroundProcess } from "../../execution/background.js";
import { summarizeExecution } from "../../runtime/executionSummary.js";
import type { RuntimeExecutionSummary } from "../../runtime/statusTypes.js";
import { buildExecutionScene } from "../../runtime/scene.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../cliValues.js";

export function registerBackgroundCommand(
  program: Command,
  options: {
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
    .description("Inspect, read, wait for, or stop background executions.");

  command
    .argument("[action]", "Optional action: list, read, wait, stop")
    .argument("[id]", "Background execution id for read, wait, or stop")
    .option("--json", "Print structured JSON.")
    .option("--timeout-ms <ms>", "Wait timeout in milliseconds.", (value) => Number.parseInt(value, 10), 60_000)
    .option("--mode <mode>", "Read mode: summary, tail, or full.", "tail")
    .option("--tail <lines>", "Number of output lines to read in tail mode.", (value) => Number.parseInt(value, 10), 80)
    .action(async (action: string | undefined, id: string | undefined, commandOptions: { json?: boolean; timeoutMs?: number; mode?: string; tail?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const normalizedAction = action ?? "list";

      if (normalizedAction === "list") {
        const executions = new BackgroundExecutionStore(runtime.stateRootDir)
          .listAll()
          .map(summarizeExecution)
          .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
        printBackgroundExecutions(executions, Boolean(commandOptions.json));
        return;
      }

      if (!id) {
        throw new Error(`background ${normalizedAction} requires an execution id.`);
      }

      if (normalizedAction === "read") {
        const output = readBackgroundExecutionOutput({
          rootDir: runtime.stateRootDir,
          id,
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
        printBackgroundExecutions([execution], Boolean(commandOptions.json));
        return;
      }

      if (normalizedAction === "stop") {
        const execution = terminateBackgroundExecution(runtime.stateRootDir, id);
        await waitForRegisteredBackgroundProcess(id);
        printBackgroundExecutions([summarizeExecution(execution)], Boolean(commandOptions.json));
        return;
      }

      throw new Error(`Unknown background action: ${normalizedAction}. Use list, read, wait, or stop.`);
    });
}

function printBackgroundExecutions(executions: RuntimeExecutionSummary[], json: boolean): void {
  if (json) {
    writeStdoutLine(JSON.stringify({ executions }, null, 2));
    return;
  }
  if (executions.length === 0) {
    ui.info("No background executions recorded.");
    return;
  }
  for (const execution of executions) {
    writeStdoutLine(formatBackgroundExecution(execution));
  }
}

export function formatBackgroundExecution(execution: RuntimeExecutionSummary): string {
  const scene = buildExecutionScene(execution);
  return [
    execution.id,
    execution.status,
    `risk=${scene.risk}`,
    execution.pid === undefined ? undefined : `pid=${execution.pid}`,
    `health=${truncateCliValue(scene.health, 90)}`,
    execution.deadlineAt ? `deadline=${execution.deadlineAt}` : undefined,
    `summary=${truncateCliValue(scene.summary, 90)}`,
    `next=${scene.nextAction}`,
    scene.lastOutput ? `lastOutput=${truncateCliValue(scene.lastOutput, 120)}` : undefined,
  ].filter(Boolean).join("  ");
}

function printBackgroundOutput(output: ReturnType<typeof readBackgroundExecutionOutput>, json: boolean): void {
  if (json) {
    writeStdoutLine(JSON.stringify(output, null, 2));
    return;
  }
  writeStdoutLine(output.output);
}

function readOutputMode(value: unknown): "summary" | "tail" | "full" | undefined {
  return value === "summary" || value === "tail" || value === "full" ? value : undefined;
}
