import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { startTuiMode } from "./tuiMode.js";

export function registerTuiCommand(
  program: Command,
  dependencies: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    cliDependencies?: Pick<CliProgramDependencies, "startTui">;
  },
): void {
  program
    .command("tui")
    .description("Start the Ink terminal UI.")
    .action(async () => {
      await startTuiMode(dependencies);
    });
}
