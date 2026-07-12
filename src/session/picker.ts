import type { SessionRecord } from "../types.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";

export function parseSessionPickerChoice(
  input: string,
  sessionCount: number,
): { kind: "new" } | { kind: "existing"; index: number } | { kind: "invalid" } {
  const trimmed = input.trim();
  if (trimmed === "") {
    return sessionCount > 0 ? { kind: "existing", index: 0 } : { kind: "new" };
  }

  const value = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(value) || String(value) !== trimmed) {
    return { kind: "invalid" };
  }

  if (value === 0) {
    return { kind: "new" };
  }

  if (value >= 1 && value <= sessionCount) {
    return { kind: "existing", index: value - 1 };
  }

  return { kind: "invalid" };
}

export function formatRelativeSessionTime(
  updatedAt: string,
  now: Date,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  const updatedTime = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedTime)) {
    return updatedAt;
  }

  const seconds = Math.max(0, Math.floor((now.getTime() - updatedTime) / 1000));
  if (seconds < 60) {
    return translate(locale, "tui.time.now");
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return translate(locale, "tui.time.minutes", { count: minutes });
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return translate(locale, "tui.time.hours", { count: hours });
  }

  const days = Math.floor(hours / 24);
  if (days < 7) {
    return translate(locale, "tui.time.days", { count: days });
  }

  const weeks = Math.floor(days / 7);
  if (days < 30) {
    return translate(locale, "tui.time.weeks", { count: weeks });
  }

  const months = Math.floor(days / 30);
  if (days < 365) {
    return translate(locale, "tui.time.months", { count: months });
  }

  return translate(locale, "tui.time.years", { count: Math.floor(days / 365) });
}

export function formatSessionPickerTitle(
  session: Pick<SessionRecord, "title" | "id">,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  const title = session.title?.trim();
  return truncateDisplayTitle(title || translate(locale, "tui.unnamedSession", { id: session.id }));
}

function truncateDisplayTitle(title: string): string {
  const chars = Array.from(title);
  const maxChars = 36;
  return chars.length > maxChars ? `${chars.slice(0, maxChars).join("")}...` : title;
}
