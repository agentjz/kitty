import type { Command } from "commander";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { runExecutionWorker } from "../../execution/worker.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerWorkerCommand(
  program: Command,
  options: {
    locale: KittyLocale;
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
    .requiredOption("--execution-id <id>", translate(options.locale, "cli.argument.executionId"))
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
