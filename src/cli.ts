#!/usr/bin/env node

import path from "node:path";

import packageJson from "../package.json";
import { getErrorMessage } from "./agent/errors.js";
import { formatCliSetupError } from "./cli/userFacingErrors.js";
import type { CliProgramDependencies } from "./cli/program.js";
import { loadDotEnvFiles } from "./config/env.js";
import { KITTY_BASE_ENV } from "./config/envKeys.js";
import { DEFAULT_LOCALE, parseKittyLocale, type KittyLocale } from "./i18n/index.js";
import {
  PROJECT_STATE_DIR_NAME,
  PROJECT_STATE_ENV_FILE_NAME,
} from "./project/statePaths.js";
import { installStdioGuards, writeStderrLine, writeStdoutLine } from "./utils/stdio.js";

function loadCliProgramModule(): typeof import("./cli/program.js") {
  return require("./cli/program.js") as typeof import("./cli/program.js");
}

export function buildCliProgram(dependencies: CliProgramDependencies = {}, locale?: KittyLocale) {
  return loadCliProgramModule().buildCliProgram(dependencies, locale);
}

export async function runCli(
  argv: string[] = process.argv,
  dependencies: CliProgramDependencies = {},
): Promise<void> {
  installStdioGuards();
  loadDotEnvFiles(readCliCwd(argv));
  const locale = parseKittyLocale(process.env[KITTY_BASE_ENV.locale]) ?? DEFAULT_LOCALE;
  const program = buildCliProgram(dependencies, locale);
  await program.parseAsync(argv);
}

function maybeHandleEntryFastPath(argv: string[]): boolean {
  const userArgs = argv.slice(2);
  if (userArgs.length === 1 && (userArgs[0] === "--version" || userArgs[0] === "-v")) {
    writeStdoutLine(packageJson.version);
    return true;
  }

  if (userArgs.length === 2 && userArgs[0] === "config" && userArgs[1] === "path") {
    writeStdoutLine(path.join(process.cwd(), PROJECT_STATE_DIR_NAME, PROJECT_STATE_ENV_FILE_NAME));
    return true;
  }

  return false;
}

if (typeof require !== "undefined" && typeof module !== "undefined" && require.main === module) {
  if (!maybeHandleEntryFastPath(process.argv)) {
    void runCli().catch((error: unknown) => {
      const locale = parseKittyLocale(process.env[KITTY_BASE_ENV.locale]) ?? DEFAULT_LOCALE;
      writeStderrLine(formatCliSetupError(error, readCliCwd(process.argv), locale) ?? getErrorMessage(error));
      process.exitCode = 1;
    });
  }
}

function readCliCwd(argv: string[]): string {
  const args = argv.slice(2);
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "-C" || value === "--cwd") {
      const next = args[index + 1];
      return next ? path.resolve(next) : process.cwd();
    }
    if (value?.startsWith("--cwd=")) {
      return path.resolve(value.slice("--cwd=".length));
    }
  }
  return process.cwd();
}
