import { resetProjectRuntime } from "../project/reset.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { formatLocalCommandHelpLine, isLocalCommand, normalizeLocalCommand } from "./localCommandDefinitions.js";
import type { ShellOutputPort } from "./shell.js";

export interface LocalCommandContext {
  cwd: string;
  session: SessionRecord;
  config: RuntimeConfig;
}

export type LocalCommandResult = "continue" | "handled" | "quit" | "multiline";

export function isExplicitExitCommand(input: string): boolean {
  return isLocalCommand(input, "exit");
}

export async function handleLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  if (!input.trim()) {
    return "handled";
  }

  const command = normalizeLocalCommand(input);

  if (command === "exit") {
    return "quit";
  }

  if (command === "reset") {
    await resetProjectRuntime({
      cwd: context.cwd,
      config: context.config,
      currentSessionId: context.session.id,
    });
    output.warn("Project runtime reset. Session closed.");
    return "quit";
  }

  if (command === "help") {
    output.plain(
      [
        formatLocalCommandHelpLine("help"),
        formatLocalCommandHelpLine("session"),
        formatLocalCommandHelpLine("config"),
        formatLocalCommandHelpLine("multiline"),
        formatLocalCommandHelpLine("reset"),
        formatLocalCommandHelpLine("exit"),
        "",
        "Any other input is sent directly to kitty.",
      ].join("\n"),
    );
    return "handled";
  }

  if (command === "multiline") {
    return "multiline";
  }

  if (command === "session") {
    output.info(`Current session: ${context.session.id}`);
    return "handled";
  }

  if (command === "config") {
    output.info(`model=${context.config.model} baseUrl=${context.config.baseUrl}`);
    return "handled";
  }

  return "continue";
}
