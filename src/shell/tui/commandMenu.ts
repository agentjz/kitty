import { listSlashCommands, type SlashCommandMetadata } from "../../interaction/localCommandDefinitions.js";
import { DEFAULT_LOCALE, type KittyLocale } from "../../i18n/index.js";

export interface TuiCommandMenuItem extends SlashCommandMetadata {
  readonly definitionIndex: number;
}

export interface TuiCommandMenuWindow {
  readonly items: readonly TuiCommandMenuItem[];
  readonly startIndex: number;
  readonly selectedIndex: number;
}

export function filterTuiCommandMenu(query: string, locale: KittyLocale = DEFAULT_LOCALE): TuiCommandMenuItem[] {
  const normalizedQuery = normalizeQuery(query);
  return listSlashCommands("tui", locale)
    .map((command, definitionIndex) => ({
      ...command,
      definitionIndex,
      score: scoreCommand(command, normalizedQuery),
    }))
    .filter((command) => command.score !== undefined)
    .sort((left, right) => (left.score! - right.score!) || (left.definitionIndex - right.definitionIndex))
    .map(({ score: _score, ...command }) => command);
}

export function windowTuiCommandMenu(
  items: readonly TuiCommandMenuItem[],
  selectedIndex: number,
  maxRows: number,
): TuiCommandMenuWindow {
  const rowLimit = Math.max(1, Math.floor(maxRows));
  const normalizedSelection = items.length === 0 ? 0 : clamp(selectedIndex, 0, items.length - 1);
  const maxStart = Math.max(0, items.length - rowLimit);
  const startIndex = clamp(normalizedSelection - rowLimit + 1, 0, maxStart);
  return {
    items: items.slice(startIndex, startIndex + rowLimit),
    startIndex,
    selectedIndex: normalizedSelection,
  };
}

export function moveTuiCommandSelection(
  itemCount: number,
  selectedIndex: number,
  direction: -1 | 1,
): number {
  if (itemCount <= 0) {
    return 0;
  }
  return (selectedIndex + direction + itemCount) % itemCount;
}

export function readSlashCommandQuery(value: string, cursor: number): string | undefined {
  if (!value.startsWith("/") || value.includes("\n")) {
    return undefined;
  }
  const beforeCursor = value.slice(0, clamp(cursor, 0, value.length));
  if (/\s/.test(beforeCursor)) {
    return undefined;
  }
  return beforeCursor.slice(1);
}

function scoreCommand(command: SlashCommandMetadata, query: string): number | undefined {
  if (!query) return 0;
  const canonical = command.name.slice(1).toLowerCase();
  const aliases = command.aliases.map((alias) => alias.slice(1).toLowerCase());
  const description = command.description.toLowerCase();
  if (canonical.startsWith(query)) return 0;
  if (aliases.some((alias) => alias.startsWith(query))) return 1;
  if (canonical.includes(query)) return 2;
  if (aliases.some((alias) => alias.includes(query))) return 3;
  if (description.includes(query)) return 4;
  const fuzzyScore = [canonical, ...aliases, description]
    .map((target) => scoreSubsequence(target, query))
    .filter((score): score is number => score !== undefined)
    .sort((left, right) => left - right)[0];
  return fuzzyScore === undefined ? undefined : 5 + fuzzyScore / 1_000;
}

function scoreSubsequence(target: string, query: string): number | undefined {
  let queryIndex = 0;
  let firstMatch = -1;
  let previousMatch = -1;
  let gaps = 0;
  for (let index = 0; index < target.length && queryIndex < query.length; index += 1) {
    if (target[index] !== query[queryIndex]) continue;
    if (firstMatch === -1) firstMatch = index;
    if (previousMatch !== -1) gaps += index - previousMatch - 1;
    previousMatch = index;
    queryIndex += 1;
  }
  if (queryIndex !== query.length) return undefined;
  return firstMatch + gaps;
}

function normalizeQuery(query: string): string {
  return query.trim().replace(/^\//, "").toLowerCase();
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
