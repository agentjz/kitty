import { Command } from "commander";

import packageJson from "../../package.json";
import { extractCliOverrides } from "./cliValues.js";
import type { CliProgramDependencies } from "./dependencies.js";
import { resolveCliRuntime } from "./runtime.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDoctorCommand } from "./commands/doctor.js";
import { registerEvaluationCommand } from "./commands/evaluation.js";
import { registerEventsCommand } from "./commands/events.js";
import { registerProjectCommands } from "./commands/project.js";
import { registerAgentCommand } from "./commands/agent.js";
import { registerBackgroundCommand } from "./commands/background.js";
import { registerSessionCommands } from "./commands/session.js";
import { writeStderr, writeStdout, writeStdoutLine } from "../utils/stdio.js";
import { registerTelegramCommands } from "../telegram/cli.js";
import { registerTuiCommand } from "./commands/tui.js";
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

  program
    .command("version")
    .description(translate(locale, "cli.version.description"))
    .action(() => {
      writeStdoutLine(packageJson.version);
    });

  registerAgentCommand(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    dependencies,
  });
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
  });
  registerEventsCommand(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
  });
  registerConfigCommands(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
  });
  registerDoctorCommand(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    probeProviderConnection: dependencies.probeProviderConnection,
  });
  registerEvaluationCommand(program, {
    locale,
    getCwd: () => {
      const overrides = getCliOverrides();
      return overrides.cwd ?? process.cwd();
    },
  });
  registerTelegramCommands(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    createTelegramService: dependencies.createTelegramService,
    acquireProcessLock: dependencies.acquireProcessLock,
  });
  registerTuiCommand(program, {
    locale,
    getCliOverrides,
    resolveRuntime,
    cliDependencies: dependencies,
  });
  return program;
}
