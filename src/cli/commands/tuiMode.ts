import { pathToFileURL } from "node:url";

import type { CliOverrides, RuntimeConfig } from "../../types.js";
import type { CliProgramDependencies } from "../dependencies.js";
import { createSessionStore } from "./sessionHelpers.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

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
    throw new Error(translate(runtime.config.locale, "cli.tui.requiresTty"));
  }

  const { startTuiChat } = await loadTuiEntrypoint(runtime.config.locale);
  await startTuiChat({
    cwd: runtime.cwd,
    cwdOverridden: Boolean(runtime.overrides.cwd),
    config: runtime.config,
    sessionStore,
  });
}

async function loadTuiEntrypoint(locale: KittyLocale): Promise<typeof import("../../shell/tui/start.js")> {
  try {
    return await import(new URL("./tui.mjs", pathToFileURL(__filename)).href) as typeof import("../../shell/tui/start.js");
  } catch (error) {
    throw new Error(translate(
      locale,
      "cli.tui.unavailable",
      { error: error instanceof Error ? error.message : String(error) },
    ));
  }
}
