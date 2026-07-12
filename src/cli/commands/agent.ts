import type { Command } from "commander";

import type { CliProgramDependencies } from "../dependencies.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { createSessionStore, resolveCliSession, runCliMode } from "./sessionHelpers.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function registerAgentCommand(
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
    .command("agent")
    .description(translate(options.locale, "cli.command.agent"))
    .argument("[prompt...]", translate(options.locale, "cli.argument.promptOptional"))
    .action(async (promptParts: string[]) => {
      const prompt = promptParts.join(" ").trim();
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const sessionStore = await createSessionStore(runtime.paths.sessionsDir);
      const selected = await resolveCliSession({
        sessionStore,
        cwd: runtime.cwd,
        cwdOverridden: Boolean(runtime.overrides.cwd),
        interactive: !prompt,
        locale: runtime.config.locale,
      });
      if (!selected) {
        return;
      }
      await runCliMode(options.dependencies, {
        prompt,
        cwd: selected.cwd,
        config: runtime.config,
        session: selected.session,
        sessionStore,
        incompleteMessage: translate(runtime.config.locale, "cli.agent.incomplete"),
        onIncomplete: (message) => {
          ui.error(message);
          process.exitCode = 1;
        },
      });
    });
}
