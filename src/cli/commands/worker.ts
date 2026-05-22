import type { Command } from "commander";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { runExecutionWorker } from "../../execution/worker.js";

export function registerWorkerCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  const worker = program.command("__worker__", { hidden: true });

  worker
    .command("run")
    .requiredOption("--execution-id <id>", "Execution id to run")
    .action(async (commandOptions: { executionId: string }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      await runExecutionWorker({
        rootDir: runtime.cwd,
        cwd: runtime.cwd,
        config: runtime.config,
        executionId: commandOptions.executionId,
      });
    });
}
