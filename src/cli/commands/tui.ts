import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { startTuiMode } from "./tuiMode.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerTuiCommand(
  program: Command,
  dependencies: {
    locale: KittyLocale;
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
    .description(translate(dependencies.locale, "cli.command.tui"))
    .action(async () => {
      await startTuiMode(dependencies);
    });
}
