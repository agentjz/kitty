import { arMessages } from "./ar.js";
import { deMessages } from "./de.js";
import { enMessages, type MessageKey } from "./en.js";
import { esMessages } from "./es.js";
import { frMessages } from "./fr.js";
import { hiMessages } from "./hi.js";
import { jaMessages } from "./ja.js";
import { koMessages } from "./ko.js";
import { ptBRMessages } from "./ptBR.js";
import { ruMessages } from "./ru.js";
import { zhCNMessages } from "./zhCN.js";
import { zhTWMessages } from "./zhTW.js";

export const SUPPORTED_LOCALES = [
  "zh-CN",
  "zh-TW",
  "en",
  "ja",
  "ko",
  "es",
  "pt-BR",
  "fr",
  "de",
  "ru",
  "ar",
  "hi",
] as const;
export type KittyLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: KittyLocale = "zh-CN";

const catalogs = {
  "zh-CN": zhCNMessages,
  "zh-TW": zhTWMessages,
  en: enMessages,
  ja: jaMessages,
  ko: koMessages,
  es: esMessages,
  "pt-BR": ptBRMessages,
  fr: frMessages,
  de: deMessages,
  ru: ruMessages,
  ar: arMessages,
  hi: hiMessages,
} as const;

export function parseKittyLocale(value: unknown): KittyLocale | undefined {
  const normalized = String(value ?? "").trim();
  return SUPPORTED_LOCALES.find((locale) => locale === normalized);
}

export function translate(
  locale: KittyLocale,
  key: MessageKey,
  values: Readonly<Record<string, string | number>> = {},
): string {
  return catalogs[locale][key].replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (placeholder, name: string) => (
    Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : placeholder
  ));
}

export type { MessageKey } from "./en.js";
