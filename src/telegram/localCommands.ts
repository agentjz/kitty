import {
  handleLocalCommand as handleSharedLocalCommand,
  type LocalCommandContext,
  type LocalCommandResult,
} from "../interaction/localCommands.js";
import { normalizeLocalCommand } from "../interaction/localCommandDefinitions.js";
import type { ShellOutputPort } from "../interaction/shell.js";
import { formatTelegramBlockedLocalCommand, formatTelegramHelp } from "./helpText.js";

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
    output.plain(formatTelegramHelp(context.config.locale));
    return "handled";
  }

  if (command === "exit" || command === "reset") {
    output.warn(formatTelegramBlockedLocalCommand(context.config.locale));
    return "handled";
  }

  return handleSharedLocalCommand(input, context, output);
}
