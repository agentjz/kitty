import { DEFAULT_LOCALE, translate, type KittyLocale, type MessageKey } from "../i18n/index.js";

export type LocalCommandId =
  | "background"
  | "config"
  | "copy"
  | "doctor"
  | "events"
  | "exit"
  | "export"
  | "help"
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
  descriptionKey: MessageKey;
  helpLabel: string;
  confirmation?: {
    acceptedInput: string;
    cancelledKey: MessageKey;
    promptKey: MessageKey;
  };
  showInIntro?: boolean;
}

export const LOCAL_COMMAND_DEFINITIONS = [
  {
    id: "exit",
    category: "system",
    aliases: ["q", "quit", "exit", "/q", "/quit", "/exit"],
    slashName: "exit",
    descriptionKey: "command.exit.description",
    helpLabel: "quit",
    showInIntro: true,
  },
  {
    id: "reset",
    category: "project",
    aliases: ["reset", "/reset"],
    slashName: "reset",
    descriptionKey: "command.reset.description",
    helpLabel: "/reset",
    confirmation: {
      acceptedInput: "reset",
      cancelledKey: "command.reset.cancelled",
      promptKey: "command.reset.prompt",
    },
    showInIntro: true,
  },
  {
    id: "help",
    category: "system",
    aliases: ["/help"],
    slashName: "help",
    descriptionKey: "command.help.description",
    helpLabel: "/help",
    showInIntro: true,
  },
  {
    id: "session",
    category: "session",
    aliases: ["/session"],
    slashName: "session",
    descriptionKey: "command.session.description",
    helpLabel: "/session",
  },
  {
    id: "sessions",
    category: "session",
    aliases: ["/sessions", "/resume", "/continue"],
    slashName: "sessions",
    descriptionKey: "command.sessions.description",
    helpLabel: "/sessions",
  },
  {
    id: "config",
    category: "project",
    aliases: ["/config"],
    slashName: "config",
    descriptionKey: "command.config.description",
    helpLabel: "/config",
  },
  {
    id: "status",
    category: "runtime",
    aliases: ["/status"],
    slashName: "status",
    descriptionKey: "command.status.description",
    helpLabel: "/status",
  },
  {
    id: "background",
    category: "runtime",
    aliases: ["/background", "/bg"],
    slashName: "background",
    descriptionKey: "command.background.description",
    helpLabel: "/background",
  },
  {
    id: "events",
    category: "runtime",
    aliases: ["/events"],
    slashName: "events",
    descriptionKey: "command.events.description",
    helpLabel: "/events",
  },
  {
    id: "skills",
    category: "runtime",
    aliases: ["/skills"],
    slashName: "skills",
    descriptionKey: "command.skills.description",
    helpLabel: "/skills",
  },
  {
    id: "doctor",
    category: "project",
    aliases: ["/doctor"],
    slashName: "doctor",
    descriptionKey: "command.doctor.description",
    helpLabel: "/doctor",
  },
  {
    id: "copy",
    category: "session",
    aliases: ["/copy"],
    slashName: "copy",
    descriptionKey: "command.copy.description",
    helpLabel: "/copy",
  },
  {
    id: "export",
    category: "session",
    aliases: ["/export"],
    slashName: "export",
    descriptionKey: "command.export.description",
    helpLabel: "/export",
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

export interface ResolvedLocalCommandDefinition extends Omit<LocalCommandDefinition, "descriptionKey" | "confirmation"> {
  description: string;
  helpText: string;
  confirmation?: {
    acceptedInput: string;
    cancelledText: string;
    prompt: string;
  };
}

export function getLocalCommandDefinition(
  id: LocalCommandId,
  locale: KittyLocale = DEFAULT_LOCALE,
): ResolvedLocalCommandDefinition {
  const definition = ALL_LOCAL_COMMAND_DEFINITIONS.find((item) => item.id === id);
  if (!definition) {
    throw new Error(`Unknown local command: ${id}`);
  }
  const description = translate(locale, definition.descriptionKey);
  return {
    ...definition,
    description,
    helpText: description,
    confirmation: definition.confirmation ? {
      acceptedInput: definition.confirmation.acceptedInput,
      cancelledText: translate(locale, definition.confirmation.cancelledKey),
      prompt: translate(locale, definition.confirmation.promptKey),
    } : undefined,
  };
}

export function formatLocalCommandHelpLine(id: LocalCommandId, locale: KittyLocale = DEFAULT_LOCALE): string {
  const definition = getLocalCommandDefinition(id, locale);
  return `${definition.helpLabel.padEnd(12)} ${definition.helpText}`;
}

export interface SlashCommandMetadata {
  name: string;
  aliases: readonly string[];
  category: LocalCommandCategory;
  description: string;
  requiresConfirmation: boolean;
}

export function listSlashCommands(locale: KittyLocale = DEFAULT_LOCALE): SlashCommandMetadata[] {
  return ALL_LOCAL_COMMAND_DEFINITIONS
    .filter((definition) => definition.slashName)
    .map((definition) => ({
      name: `/${definition.slashName}`,
      aliases: definition.aliases
        .filter((alias) => alias.startsWith("/") && alias !== `/${definition.slashName}`),
      category: definition.category,
      description: translate(locale, definition.descriptionKey),
      requiresConfirmation: Boolean(definition.confirmation),
    }));
}

export function formatLocalCommandHelp(locale: KittyLocale = DEFAULT_LOCALE): string {
  return [
    translate(locale, "command.help.header"),
    ...ALL_LOCAL_COMMAND_DEFINITIONS.map((definition) => formatLocalCommandHelpLine(definition.id, locale)),
    "",
    translate(locale, "command.help.footer"),
  ].join("\n");
}

export function listIntroLocalCommands(locale: KittyLocale = DEFAULT_LOCALE): ResolvedLocalCommandDefinition[] {
  return ALL_LOCAL_COMMAND_DEFINITIONS
    .filter((definition) => definition.showInIntro)
    .map((definition) => getLocalCommandDefinition(definition.id, locale));
}
