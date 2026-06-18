import type { Command } from "commander";
import { pathToFileURL } from "node:url";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { createSessionStore } from "./sessionHelpers.js";

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
  },
): void {
  program
    .command("tui")
    .description("Start the Ink terminal UI.")
    .action(async () => {
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        throw new Error("kitty tui requires an interactive TTY.");
      }

      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);

      const { startTuiChat } = await loadTuiEntrypoint();
      await startTuiChat({
        cwd: runtime.cwd,
        cwdOverridden: Boolean(runtime.overrides.cwd),
        config: runtime.config,
        sessionStore,
      });
    });
}

async function loadTuiEntrypoint(): Promise<typeof import("../../shell/tui/start.js")> {
  try {
    return await import(new URL("./tui.mjs", pathToFileURL(__filename)).href) as typeof import("../../shell/tui/start.js");
  } catch (error) {
    throw new Error(`TUI entrypoint is unavailable. Run npm.cmd run build and try again. Cause: ${error instanceof Error ? error.message : String(error)}`);
  }
}
