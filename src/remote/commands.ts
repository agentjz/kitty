import { translate, type KittyLocale } from "../i18n/index.js";
import { listSlashCommands, normalizeLocalCommand, type LocalCommandId, type LocalCommandSurface } from "../interaction/localCommandDefinitions.js";

export type RemoteCommandId = Extract<LocalCommandId, "help" | "new" | "status" | "stop">;
export type RemoteCommandSurface = Extract<LocalCommandSurface, "telegram" | "weixin">;

export function parseRemoteCommand(input: string, surface: RemoteCommandSurface): RemoteCommandId | undefined {
  const command = normalizeLocalCommand(input, surface);
  return command === "help" || command === "new" || command === "status" || command === "stop" ? command : undefined;
}

export function formatRemoteCommandHelp(surface: RemoteCommandSurface, locale: KittyLocale): string {
  return listSlashCommands(surface, locale)
    .map((command) => `${command.name.padEnd(12)} ${command.description}`)
    .join("\n");
}

export function formatRemoteBlockedCommand(locale: KittyLocale): string {
  return translate(locale, "remote.blockedCommand");
}
