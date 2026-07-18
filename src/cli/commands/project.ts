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
    startLocalConsole?: (cwd: string) => Promise<{ url: string; close(): Promise<void>; wait(): Promise<void> }>;
    openBrowser?: (url: string) => boolean | Promise<boolean>;
  },
): void {
  registerRuntimeStatusCommand(program, options);

  program
    .command("start")
    .description(translate(options.locale, "cli.command.start"))
    .action(async () => {
      const overrides = options.getCliOverrides();
      const cwd = overrides.cwd ? path.resolve(overrides.cwd) : process.cwd();
      const { initializeProjectFiles } = await import("../../config/init.js");
      await initializeProjectFiles(cwd);
      const startConsole = options.startLocalConsole ?? (await import("../../web/server.js")).startLocalConsole;
      const open = options.openBrowser ?? (await import("../../web/openBrowser.js")).openBrowser;
      const consoleHandle = await startConsole(cwd);
      ui.success(translate(options.locale, "cli.start.ready"));
      writeStdoutLine(consoleHandle.url);
      if (!await open(consoleHandle.url)) ui.info(translate(options.locale, "cli.start.browserFailed"));

      let closing = false;
      const close = () => {
        if (closing) return;
        closing = true;
        void consoleHandle.close();
      };
      process.once("SIGINT", close);
      process.once("SIGTERM", close);
      try { await consoleHandle.wait(); }
      finally {
        process.off("SIGINT", close);
        process.off("SIGTERM", close);
        await consoleHandle.close();
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
