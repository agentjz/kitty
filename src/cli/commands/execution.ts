import type { Command } from "commander";

import { cancelExecution, readExecutionOutput } from "../../execution/lifecycle.js";
import { ExecutionStore } from "../../execution/store.js";
import { summarizeExecution } from "../../runtime/executionSummary.js";
import type { RuntimeExecutionSummary } from "../../runtime/statusTypes.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../cliValues.js";

export function registerExecutionCommand(
  program: Command,
  options: {
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
    .description("Inspect, read, or cancel recorded executions.");

  command
    .command("list")
    .option("--json", "Print structured JSON.")
    .action(async (commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const executions = new ExecutionStore(readStateRoot(runtime))
        .list()
        .map(summarizeExecution)
        .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
      printExecutionList(executions, Boolean(commandOptions.json));
    });

  command
    .command("inspect")
    .argument("<id>", "Execution id")
    .option("--json", "Print structured JSON.")
    .action(async (id: string, commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const execution = new ExecutionStore(readStateRoot(runtime)).load(id);
      if (!execution) {
        throw new Error(`Unknown execution: ${id}`);
      }
      printExecutionList([summarizeExecution(execution)], Boolean(commandOptions.json));
    });

  command
    .command("read")
    .argument("<id>", "Execution id")
    .option("--json", "Print structured JSON.")
    .option("--mode <mode>", "Read mode: summary, tail, or full.", "tail")
    .option("--tail <lines>", "Number of output lines to read in tail mode.", (value) => Number.parseInt(value, 10), 80)
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
    .argument("<id>", "Execution id")
    .option("--json", "Print structured JSON.")
    .action(async (id: string, commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const execution = cancelExecution(readStateRoot(runtime), id, {
        terminatedBy: "cli",
      });
      printExecutionList([summarizeExecution(execution)], Boolean(commandOptions.json));
    });
}

function printExecutionList(executions: RuntimeExecutionSummary[], json: boolean): void {
  if (json) {
    writeStdoutLine(JSON.stringify({ executions }, null, 2));
    return;
  }
  if (executions.length === 0) {
    ui.info("No executions recorded.");
    return;
  }
  for (const execution of executions) {
    writeStdoutLine(formatExecutionLine(execution));
  }
}

function formatExecutionLine(execution: RuntimeExecutionSummary): string {
  return [
    execution.id,
    execution.kind,
    execution.status,
    execution.actorName ? `actor=${execution.actorName}` : undefined,
    execution.pid === undefined ? undefined : `pid=${execution.pid}`,
    execution.deadlineAt ? `deadline=${execution.deadlineAt}` : undefined,
    execution.summary ? `summary=${truncateCliValue(execution.summary, 90)}` : undefined,
    execution.outputPreview ? `lastOutput=${truncateCliValue(execution.outputPreview, 120)}` : undefined,
  ].filter(Boolean).join("  ");
}

function readStateRoot(runtime: { cwd: string; stateRootDir?: string }): string {
  return runtime.stateRootDir ?? runtime.cwd;
}

function readOutputMode(value: unknown): "summary" | "tail" | "full" | undefined {
  return value === "summary" || value === "tail" || value === "full" ? value : undefined;
}
