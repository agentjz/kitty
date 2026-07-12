import { translate, type KittyLocale } from "../i18n/index.js";

export function formatTelegramHelp(locale: KittyLocale): string {
  return [
    translate(locale, "telegram.help.help"),
    translate(locale, "telegram.help.stop"),
    translate(locale, "telegram.help.status"),
    "",
    translate(locale, "telegram.help.files"),
    translate(locale, "telegram.help.sendFile"),
    translate(locale, "telegram.help.analyzeFile"),
    translate(locale, "telegram.help.stopTask"),
    "",
    translate(locale, "telegram.help.note"),
  ].join("\n");
}

export function formatTelegramBlockedLocalCommand(locale: KittyLocale): string {
  return translate(locale, "telegram.blockedLocal");
}
