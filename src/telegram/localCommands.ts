import {
  handleLocalCommand as handleSharedLocalCommand,
  type LocalCommandContext,
  type LocalCommandResult,
} from "../interaction/localCommands.js";
import { normalizeLocalCommand } from "../interaction/localCommandDefinitions.js";
import type { ShellOutputPort } from "../interaction/shell.js";
import {
  TELEGRAM_BLOCKED_LOCAL_COMMAND_TEXT,
  TELEGRAM_HELP_TEXT,
} from "./helpText.zh.js";

export async function handleTelegramLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  if (!input.trim()) {
    return "handled";
  }

  const command = normalizeLocalCommand(input);

  if (command === "help") {
    output.plain(TELEGRAM_HELP_TEXT);
    return "handled";
  }

  if (command === "exit" || command === "reset") {
    output.warn(TELEGRAM_BLOCKED_LOCAL_COMMAND_TEXT);
    return "handled";
  }

  return handleSharedLocalCommand(input, context, output);
}
