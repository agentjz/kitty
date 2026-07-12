import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import { loadLatestSession } from "../../host/session.js";
import type { CliOverrides, RuntimeConfig, SessionRecord } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { ui } from "../../utils/console.js";
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
  program
    .argument("[prompt...]", translate(options.locale, "cli.argument.promptOptional"))
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      if (!prompt) {
        await startTuiMode({
          getCliOverrides: options.getCliOverrides,
          resolveRuntime: options.resolveRuntime,
          cliDependencies: options.dependencies,
        });
        return;
      }
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const selected = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
        cwdOverridden: Boolean(runtime.overrides.cwd),
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

      if (!session) {
        throw new Error(translate(runtime.config.locale, "cli.sessions.none"));
      }

      await runCliMode(options.dependencies, {
        prompt: "",
        cwd: runtime.overrides.cwd ? runtime.cwd : session.cwd,
        config: runtime.config,
        session,
        sessionStore,
      });
    });

  program
    .command("sessions")
    .description(translate(options.locale, "cli.command.sessions"))
    .option("-n, --limit <count>", translate(options.locale, "cli.option.limitSessions"), (value) => Number.parseInt(value, 10), 20)
    .action(async (commandOptions: { limit?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const sessions = await sessionStore.list(commandOptions.limit ?? 20);

      if (sessions.length === 0) {
        ui.info(translate(runtime.config.locale, "cli.sessions.noneYet"));
        return;
      }

      for (const session of sessions) {
        writeStdoutLine(
          [
            session.id,
            session.updatedAt,
            session.title ?? translate(runtime.config.locale, "common.untitled"),
            `${translate(runtime.config.locale, "status.label.messages")}=${session.messageCount}`,
          ].join("  "),
        );
      }
    });
}
