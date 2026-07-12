import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { loadLatestSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { createSessionStore, resolveCliSession, runCliMode } from "./sessionHelpers.js";
import { startTuiMode } from "./tuiMode.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerSessionCommands(
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
    dependencies: CliProgramDependencies;
  },
): void {
  program.action(async () => {
    await startTuiMode({
      getCliOverrides: options.getCliOverrides,
      resolveRuntime: options.resolveRuntime,
      cliDependencies: options.dependencies,
    });
  });

  program
    .command("run")
    .description(translate(options.locale, "cli.command.run"))
    .argument("<prompt...>", translate(options.locale, "cli.argument.promptRequired"))
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const selected = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
        locale: runtime.config.locale,
      });
      if (!selected) {
        return;
      }
      const result = await runCliMode(options.dependencies, {
        prompt,
        cwd: selected.cwd,
        config: runtime.config,
        session: selected.session,
        sessionStore,
      });
      if (result) {
        writeStdoutLine(JSON.stringify(result.closeout));
      }
    });

  program
    .command("resume")
    .description(translate(options.locale, "cli.command.resume"))
    .argument("[sessionId]", translate(options.locale, "cli.argument.sessionIdOptional"))
    .action(async (sessionId: string | undefined) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const session = sessionId ? await sessionStore.load(sessionId) : await loadLatestSession(sessionStore);
      if (!session) throw new Error(translate(runtime.config.locale, "cli.sessions.none"));
      await runCliMode(options.dependencies, {
        prompt: "",
        cwd: runtime.overrides.cwd ? runtime.cwd : session.cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
    });
}
