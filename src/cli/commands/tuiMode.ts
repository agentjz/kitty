import { pathToFileURL } from "node:url";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import type { CliProgramDependencies } from "../dependencies.js";
import { createSessionStore } from "./sessionHelpers.js";

export async function startTuiMode(dependencies: {
  getCliOverrides: () => CliOverrides;
  resolveRuntime: (overrides: CliOverrides) => Promise<{
    cwd: string;
    config: RuntimeConfig;
    paths: RuntimeConfig["paths"];
    overrides: CliOverrides;
  }>;
  cliDependencies?: Pick<CliProgramDependencies, "startTui">;
}): Promise<void> {
  const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
  const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
  if (dependencies.cliDependencies?.startTui) {
    await dependencies.cliDependencies.startTui({
      cwd: runtime.cwd,
      cwdOverridden: Boolean(runtime.overrides.cwd),
      config: runtime.config,
      sessionStore,
    });
    return;
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error("kitty requires an interactive TTY. Use kitty run <prompt> for one-shot execution.");
  }

  const { startTuiChat } = await loadTuiEntrypoint();
  await startTuiChat({
    cwd: runtime.cwd,
    cwdOverridden: Boolean(runtime.overrides.cwd),
    config: runtime.config,
    sessionStore,
  });
}

async function loadTuiEntrypoint(): Promise<typeof import("../../shell/tui/start.js")> {
  try {
    return await import(new URL("./tui.mjs", pathToFileURL(__filename)).href) as typeof import("../../shell/tui/start.js");
  } catch (error) {
    throw new Error(`TUI entrypoint is unavailable. Run npm.cmd run build and try again. Cause: ${error instanceof Error ? error.message : String(error)}`);
  }
}
