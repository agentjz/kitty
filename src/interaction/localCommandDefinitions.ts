import { DEFAULT_LOCALE, translate, type KittyLocale, type MessageKey } from "../i18n/index.js";

export type LocalCommandId = "exit" | "export" | "help" | "new" | "status" | "stop";
export type LocalCommandSurface = "telegram" | "tui" | "weixin" | "web";
export type LocalCommandCategory = "runtime" | "session" | "system";

export interface LocalCommandDefinition {
  readonly id: LocalCommandId;
  readonly category: LocalCommandCategory;
  readonly slashName: string;
  readonly descriptionKey: MessageKey;
  readonly surfaces: readonly LocalCommandSurface[];
}

export const LOCAL_COMMAND_DEFINITIONS = [
  {
    id: "status",
    category: "runtime",
    slashName: "status",
    descriptionKey: "command.status.description",
    surfaces: ["tui", "telegram", "weixin", "web"],
  },
  {
    id: "export",
    category: "session",
    slashName: "export",
    descriptionKey: "command.export.description",
    surfaces: ["tui"],
  },
  {
    id: "exit",
    category: "system",
    slashName: "exit",
    descriptionKey: "command.exit.description",
    surfaces: ["tui"],
  },
  {
    id: "help",
    category: "system",
    slashName: "help",
    descriptionKey: "command.help.description",
    surfaces: ["telegram", "weixin", "web"],
  },
  {
    id: "stop",
    category: "runtime",
    slashName: "stop",
    descriptionKey: "remote.command.stop.description",
    surfaces: ["tui", "telegram", "weixin", "web"],
  },
  {
    id: "new",
    category: "session",
    slashName: "new",
    descriptionKey: "remote.command.new.description",
    surfaces: ["tui", "telegram", "weixin", "web"],
  },
] as const satisfies readonly LocalCommandDefinition[];

export function normalizeLocalCommand(
  input: string,
  surface: LocalCommandSurface = "tui",
): LocalCommandId | undefined {
  const normalized = input.trim().toLowerCase();
  return LOCAL_COMMAND_DEFINITIONS.find((definition) =>
    supportsSurface(definition, surface) && normalized === `/${definition.slashName}`)?.id;
}

export function isLocalCommand(input: string, id: LocalCommandId, surface: LocalCommandSurface = "tui"): boolean {
  return normalizeLocalCommand(input, surface) === id;
}

export interface SlashCommandMetadata {
  name: string;
  aliases: readonly string[];
  category: LocalCommandCategory;
  description: string;
}

export function listSlashCommands(
  surface: LocalCommandSurface = "tui",
  locale: KittyLocale = DEFAULT_LOCALE,
): SlashCommandMetadata[] {
  return LOCAL_COMMAND_DEFINITIONS
    .filter((definition) => supportsSurface(definition, surface))
    .map((definition) => ({
      name: `/${definition.slashName}`,
      aliases: [],
      category: definition.category,
      description: translate(locale, definition.descriptionKey),
    }));
}

export function formatLocalCommandHelp(
  surface: LocalCommandSurface,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  return [
    translate(locale, "command.help.header"),
    ...listSlashCommands(surface, locale).map((command) => `${command.name.padEnd(12)} ${command.description}`),
    "",
    translate(locale, "command.help.footer"),
  ].join("\n");
}

function supportsSurface(definition: LocalCommandDefinition, surface: LocalCommandSurface): boolean {
  return definition.surfaces.includes(surface);
}
