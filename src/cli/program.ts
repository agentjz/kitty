import { Command } from "commander";

import packageJson from "../../package.json";
import { extractCliOverrides } from "./cliValues.js";
import type { CliProgramDependencies } from "./dependencies.js";
import { resolveCliRuntime } from "./runtime.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerBackgroundCommand } from "./commands/background.js";
import { registerSessionCommands } from "./commands/session.js";
import { writeStderr, writeStdout } from "../utils/stdio.js";
import { registerTelegramCommands } from "../telegram/cli.js";
import { registerWeixinCommands } from "../weixin/cli.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";

export { type CliProgramDependencies } from "./dependencies.js";

export function buildCliProgram(
  dependencies: CliProgramDependencies = {},
  locale: KittyLocale = DEFAULT_LOCALE,
): Command {
  const program = new Command();
  const resolveRuntime = dependencies.resolveRuntime ?? resolveCliRuntime;
  const getCliOverrides = () => extractCliOverrides(program.opts());

  program
    .name("kitty")
    .description(translate(locale, "cli.program.description"))
    .version(packageJson.version, "-v, --version", translate(locale, "cli.version.description"))
    .configureOutput({
      writeOut: (text) => {
        writeStdout(text);
      },
      writeErr: (text) => {
        writeStderr(text);
      },
      outputError: (text, write) => {
        write(text);
      },
    })
    .option("-m, --model <model>", translate(locale, "cli.option.model"))
    .option("-C, --cwd <path>", translate(locale, "cli.option.cwd"));

  registerBackgroundCommand(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
  });
  registerSessionCommands(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    dependencies,
  });
  registerProjectCommands(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    startLocalConsole: dependencies.startLocalConsole,
    openBrowser: dependencies.openBrowser,
  });
  registerTelegramCommands(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    createTelegramService: dependencies.createTelegramService,
    acquireProcessLock: dependencies.acquireProcessLock,
  });
  registerWeixinCommands(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    createWeixinService: dependencies.createWeixinService,
    acquireProcessLock: dependencies.acquireProcessLock,
  });
  return program;
}
