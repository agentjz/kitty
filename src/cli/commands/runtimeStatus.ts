import type { Command } from "commander";

import { buildRuntimeStatus } from "../../runtime/status.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { formatRuntimeStatusText } from "./runtimeStatusPresenter.js";

export function registerRuntimeStatusCommand(
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
  program
    .command("status")
    .description("Show the current project runtime status.")
    .option("--json", "Print structured JSON.")
    .action(async (commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const status = await buildRuntimeStatus(runtime.cwd);

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify(status, null, 2));
        return;
      }

      writeStdoutLine(formatRuntimeStatusText(status).trimEnd());
    });
}
