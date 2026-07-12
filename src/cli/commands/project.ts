import type { Command } from "commander";
import path from "node:path";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../cliValues.js";
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
    .command("changes")
    .description(translate(options.locale, "cli.command.changes"))
    .argument("[changeId]", translate(options.locale, "cli.argument.changeIdOptional"))
    .option("-n, --limit <count>", translate(options.locale, "cli.option.limitChanges"), (value) => Number.parseInt(value, 10), 20)
    .action(async (changeId: string | undefined, commandOptions: { limit?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { ChangeStore } = await import("../../agent/changes/store.js");
      const changeStore = new ChangeStore(runtime.paths.changesDir);

      if (changeId) {
        const change = await changeStore.load(changeId);
        writeStdoutLine(JSON.stringify(change, null, 2));
        return;
      }

      const changes = await changeStore.list(commandOptions.limit ?? 20);
      if (changes.length === 0) {
        ui.info(translate(runtime.config.locale, "cli.changes.none"));
        return;
      }

      for (const change of changes) {
        writeStdoutLine(
          [
            change.id,
            change.createdAt,
            change.toolName,
            `${translate(runtime.config.locale, "status.label.files")}=${change.operations.length}`,
            translate(runtime.config.locale, change.undoneAt ? "common.undone" : "common.active"),
            truncateCliValue(change.summary, 80),
          ].join("  "),
        );
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

  program
    .command("diff")
    .description(translate(options.locale, "cli.command.diff"))
    .argument("[target]", translate(options.locale, "cli.argument.targetOptional"))
    .action(async (target: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const { execa } = await import("execa");
      const result = await execa("git", target ? ["diff", "--", target] : ["diff"], {
        cwd: runtime.cwd,
        all: true,
        reject: false,
      });

      if ((result.exitCode ?? 0) > 1) {
        throw new Error(result.all || translate(runtime.config.locale, "cli.diff.failed"));
      }

      const output = result.all?.trim();
      writeStdoutLine(output ? output : translate(runtime.config.locale, "cli.diff.none"));
    });
}
