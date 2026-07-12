import type { Command } from "commander";
import path from "node:path";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { registerRuntimeStatusCommand } from "./runtimeStatus.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerProjectCommands(
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
  registerRuntimeStatusCommand(program, options);

  program
    .command("init")
    .description(translate(options.locale, "cli.command.init"))
    .action(async () => {
      const overrides = options.getCliOverrides();
      const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
      const { initializeProjectFiles } = await import("../../config/init.js");
      const { formatConfigPreflightReport } = await import("../../config/preflight.js");
      const result = await initializeProjectFiles(cwd);

      if (result.created.length > 0) {
        ui.success(translate(options.locale, "cli.init.created", { count: result.created.length }));
        for (const filePath of result.created) {
          writeStdoutLine(filePath);
        }
      }

      if (result.skipped.length > 0) {
        ui.info(translate(options.locale, "cli.init.skipped", { count: result.skipped.length }));
        for (const filePath of result.skipped) {
          writeStdoutLine(filePath);
        }
      }

      ui.heading(translate(options.locale, "preflight.status"));
      for (const line of formatConfigPreflightReport(result.preflight, options.locale)) {
        writeStdoutLine(line);
      }
    });

  program
    .command("undo")
    .description(translate(options.locale, "cli.command.undo"))
    .argument("[changeId]", translate(options.locale, "cli.argument.changeIdOptional"))
    .action(async (changeId: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { ChangeStore } = await import("../../agent/changes/store.js");
      const changeStore = new ChangeStore(runtime.paths.changesDir);
      const result = await changeStore.undo(changeId);

      ui.success(translate(runtime.config.locale, "cli.undo.done", { id: result.record.id }));
      for (const filePath of result.restoredPaths) {
        writeStdoutLine(filePath);
      }
    });
}
