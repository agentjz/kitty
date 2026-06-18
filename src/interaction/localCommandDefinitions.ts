export type LocalCommandId =
  | "background"
  | "clear"
  | "config"
  | "copy"
  | "doctor"
  | "events"
  | "exit"
  | "export"
  | "help"
  | "memory"
  | "reset"
  | "session"
  | "sessions"
  | "skills"
  | "status";

export type LocalCommandCategory = "session" | "runtime" | "project" | "system";

export interface LocalCommandDefinition {
  id: LocalCommandId;
  category: LocalCommandCategory;
  aliases: readonly string[];
  slashName: string;
  description: string;
  helpLabel: string;
  helpText: string;
  showInIntro?: boolean;
}

export const LOCAL_COMMAND_DEFINITIONS = [
  {
    id: "exit",
    category: "system",
    aliases: ["q", "quit", "exit", "/q", "/quit", "/exit"],
    slashName: "exit",
    description: "Exit the session",
    helpLabel: "quit",
    helpText: "Exit the session",
    showInIntro: true,
  },
  {
    id: "reset",
    category: "project",
    aliases: ["reset", "/reset"],
    slashName: "reset",
    description: "Clear current project runtime state and exit",
    helpLabel: "/reset",
    helpText: "Clear current project runtime state and exit",
    showInIntro: true,
  },
  {
    id: "help",
    category: "system",
    aliases: ["/help"],
    slashName: "help",
    description: "Show slash commands",
    helpLabel: "/help",
    helpText: "Show slash commands",
    showInIntro: true,
  },
  {
    id: "session",
    category: "session",
    aliases: ["/session"],
    slashName: "session",
    description: "Show current session ID",
    helpLabel: "/session",
    helpText: "Show current session ID",
  },
  {
    id: "sessions",
    category: "session",
    aliases: ["/sessions", "/resume", "/continue"],
    slashName: "sessions",
    description: "List recent sessions",
    helpLabel: "/sessions",
    helpText: "List recent sessions",
  },
  {
    id: "config",
    category: "project",
    aliases: ["/config"],
    slashName: "config",
    description: "Show current runtime config",
    helpLabel: "/config",
    helpText: "Show current runtime config",
  },
  {
    id: "status",
    category: "runtime",
    aliases: ["/status"],
    slashName: "status",
    description: "Show current project scene",
    helpLabel: "/status",
    helpText: "Show current project scene",
  },
  {
    id: "background",
    category: "runtime",
    aliases: ["/background", "/bg"],
    slashName: "background",
    description: "Show background task scene",
    helpLabel: "/background",
    helpText: "Show background task scene",
  },
  {
    id: "events",
    category: "runtime",
    aliases: ["/events"],
    slashName: "events",
    description: "Show recent session events",
    helpLabel: "/events",
    helpText: "Show recent session events",
  },
  {
    id: "memory",
    category: "runtime",
    aliases: ["/memory"],
    slashName: "memory",
    description: "List runtime memory assets",
    helpLabel: "/memory",
    helpText: "List runtime memory assets",
  },
  {
    id: "skills",
    category: "runtime",
    aliases: ["/skills"],
    slashName: "skills",
    description: "List runtime skills",
    helpLabel: "/skills",
    helpText: "List runtime skills",
  },
  {
    id: "doctor",
    category: "project",
    aliases: ["/doctor"],
    slashName: "doctor",
    description: "Run local setup preflight",
    helpLabel: "/doctor",
    helpText: "Run local setup preflight",
  },
  {
    id: "copy",
    category: "session",
    aliases: ["/copy"],
    slashName: "copy",
    description: "Print current session transcript",
    helpLabel: "/copy",
    helpText: "Print current session transcript",
  },
  {
    id: "export",
    category: "session",
    aliases: ["/export"],
    slashName: "export",
    description: "Print current session snapshot JSON",
    helpLabel: "/export",
    helpText: "Print current session snapshot JSON",
  },
  {
    id: "clear",
    category: "session",
    aliases: ["/clear"],
    slashName: "clear",
    description: "Clear the current prompt in UI shells",
    helpLabel: "/clear",
    helpText: "Clear the current prompt in UI shells",
  },
] as const satisfies readonly LocalCommandDefinition[];

const ALL_LOCAL_COMMAND_DEFINITIONS: readonly LocalCommandDefinition[] = LOCAL_COMMAND_DEFINITIONS;

const LOCAL_COMMAND_BY_ALIAS = new Map<string, LocalCommandId>(
  ALL_LOCAL_COMMAND_DEFINITIONS.flatMap((definition) =>
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
  const definition = ALL_LOCAL_COMMAND_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown local command: ${id}`);
  }
  return definition;
}

export function formatLocalCommandHelpLine(id: LocalCommandId): string {
  const definition = getLocalCommandDefinition(id);
  return `${definition.helpLabel.padEnd(12)} ${definition.helpText}`;
}

export interface SlashCommandMetadata {
  name: string;
  aliases: readonly string[];
  category: LocalCommandCategory;
  description: string;
}

export function listSlashCommands(): SlashCommandMetadata[] {
  return ALL_LOCAL_COMMAND_DEFINITIONS
    .filter((definition) => definition.slashName)
    .map((definition) => ({
      name: `/${definition.slashName}`,
      aliases: definition.aliases
        .filter((alias) => alias.startsWith("/") && alias !== `/${definition.slashName}`),
      category: definition.category,
      description: definition.description,
    }));
}

export function formatLocalCommandHelp(): string {
  return [
    "Slash commands:",
    ...ALL_LOCAL_COMMAND_DEFINITIONS.map((definition) => formatLocalCommandHelpLine(definition.id)),
    "",
    "Any other input is sent directly to kitty.",
  ].join("\n");
}

export function listIntroLocalCommands(): LocalCommandDefinition[] {
  return ALL_LOCAL_COMMAND_DEFINITIONS.filter((definition) => definition.showInIntro);
}
