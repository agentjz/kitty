import type { Command } from "commander";

import { buildRuntimeStatus } from "../../runtime/status.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { formatRuntimeStatusText } from "./runtimeStatusPresenter.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerRuntimeStatusCommand(
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
  program
    .command("status")
    .description(translate(options.locale, "cli.command.status"))
    .option("--json", translate(options.locale, "cli.option.json"))
    .action(async (commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const status = await buildRuntimeStatus(runtime.cwd, runtime.config.locale);

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify(status, null, 2));
        return;
      }

      writeStdoutLine(formatRuntimeStatusText(status, runtime.config.locale).trimEnd());
    });
}
