export type LocalCommandId = "exit" | "reset" | "help" | "session" | "config" | "multiline";

export interface LocalCommandDefinition {
  id: LocalCommandId;
  aliases: readonly string[];
  helpLabel: string;
  helpText: string;
}

export const LOCAL_COMMAND_DEFINITIONS = [
  {
    id: "exit",
    aliases: ["q", "quit", "exit", "/q", "/quit", "/exit"],
    helpLabel: "quit",
    helpText: "Exit the session",
  },
  {
    id: "reset",
    aliases: ["reset", "/reset"],
    helpLabel: "/reset",
    helpText: "Clear current project runtime state and exit",
  },
  {
    id: "help",
    aliases: ["/help"],
    helpLabel: "/help",
    helpText: "Show help",
  },
  {
    id: "session",
    aliases: ["/session"],
    helpLabel: "/session",
    helpText: "Show current session ID",
  },
  {
    id: "config",
    aliases: ["/config"],
    helpLabel: "/config",
    helpText: "Show current runtime config",
  },
  {
    id: "multiline",
    aliases: ["/multi"],
    helpLabel: "/multi",
    helpText: "Enter multiline input; use ::end to submit and ::cancel to cancel",
  },
] as const satisfies readonly LocalCommandDefinition[];

const LOCAL_COMMAND_BY_ALIAS = new Map<string, LocalCommandId>(
  LOCAL_COMMAND_DEFINITIONS.flatMap((definition) =>
    definition.aliases.map((alias) => [alias, definition.id] as const),
  ),
);

export function normalizeLocalCommand(input: string): LocalCommandId | undefined {
  return LOCAL_COMMAND_BY_ALIAS.get(input.trim().toLowerCase());
}

export function isLocalCommand(input: string, id: LocalCommandId): boolean {
  return normalizeLocalCommand(input) === id;
}

export function getLocalCommandDefinition(id: LocalCommandId): LocalCommandDefinition {
  const definition = LOCAL_COMMAND_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown local command: ${id}`);
  }
  return definition;
}

export function formatLocalCommandHelpLine(id: LocalCommandId): string {
  const definition = getLocalCommandDefinition(id);
  return `${definition.helpLabel.padEnd(12)} ${definition.helpText}`;
}
