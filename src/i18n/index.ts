import { enMessages, type MessageKey } from "./en.js";
import { jaMessages } from "./ja.js";
import { koMessages } from "./ko.js";
import { zhCNMessages } from "./zhCN.js";

export const SUPPORTED_LOCALES = [
  "zh-CN",
  "en",
  "ja",
  "ko",
] as const;
export type KittyLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: KittyLocale = "zh-CN";

const catalogs = {
  "zh-CN": zhCNMessages,
  en: enMessages,
  ja: jaMessages,
  ko: koMessages,
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
