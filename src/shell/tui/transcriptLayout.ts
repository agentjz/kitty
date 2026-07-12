import { renderMarkdownLines } from "./markdown.js";
import {
  applyTranscriptMarkdownStyle,
  readTranscriptRoleFrame,
  readTranscriptRoleStyle,
  TRANSCRIPT_OUTER_PADDING_X,
} from "./transcriptFrame.js";
import type { TuiMarkdownLineKind, TuiMarkdownSpan } from "./markdown.js";
import type {
  TuiTranscriptEntry,
  TuiTranscriptLineFrame,
  TuiTranscriptLineSpan,
  TuiTranscriptLineStyle,
  TuiTranscriptLineView,
  TuiTranscriptRole,
  TuiTranscriptTheme,
} from "./transcriptTypes.js";
import {
  wrapTranscriptEntryRows,
  type TuiTranscriptSourceRow,
  type TuiTranscriptWrappedRow,
} from "./transcriptWrap.js";
import { DEFAULT_LOCALE, type KittyLocale } from "../../i18n/index.js";

export { TRANSCRIPT_OUTER_PADDING_X };
export type {
  TuiTranscriptEntry,
  TuiTranscriptLineFrame,
  TuiTranscriptLineSpan,
  TuiTranscriptLineStyle,
  TuiTranscriptLineView,
  TuiTranscriptRole,
  TuiTranscriptTheme,
};

export function renderTranscriptLineViews(
  entries: readonly TuiTranscriptEntry[],
  viewportWidth: number,
  theme: TuiTranscriptTheme,
  locale: KittyLocale = DEFAULT_LOCALE,
): TuiTranscriptLineView[] {
  return entries.flatMap((entry) => renderTranscriptEntryLineViews(entry, viewportWidth, theme, locale));
}

export function renderTranscriptRows(
  entries: readonly TuiTranscriptEntry[],
  viewportWidth: number,
  theme: TuiTranscriptTheme,
  locale: KittyLocale = DEFAULT_LOCALE,
): string[] {
  return renderTranscriptLineViews(entries, viewportWidth, theme, locale).map((line) => line.text);
}

export function measureTranscriptRows(
  entries: readonly TuiTranscriptEntry[],
  viewportWidth: number,
  theme: TuiTranscriptTheme,
  locale: KittyLocale = DEFAULT_LOCALE,
): number {
  return renderTranscriptLineViews(entries, viewportWidth, theme, locale).length;
}

export function renderTranscriptEntryLineViews(
  entry: TuiTranscriptEntry,
  viewportWidth: number,
  theme: TuiTranscriptTheme,
  locale: KittyLocale = DEFAULT_LOCALE,
): TuiTranscriptLineView[] {
  const frame = readTranscriptRoleFrame(entry.role, viewportWidth);
  const style = readTranscriptRoleStyle(entry.role, theme);
  const sourceRows = readEntryDisplayRows(entry);
  const contentRows = wrapTranscriptEntryRows(entry, sourceRows, frame.bodyWidth, locale);
  const wrappedRows = contentRows.length > 0
    ? contentRows
    : [{ markdownKind: undefined, language: undefined, prefix: "", text: "", spans: [] }];
  const rows = entry.role === "user"
    ? [createEmptyWrappedRow(), ...wrappedRows, createEmptyWrappedRow()]
    : wrappedRows;
  const entryId = entry.id;
  const firstContentIndex = rows.findIndex((row) => row.text.length > 0 || row.spans.length > 0 || row.prefix.length > 0);
  return [
    {
      id: `${entryId}-spacer`,
      entryId,
      role: entry.role,
      kind: "spacer",
      text: "",
      spans: [],
      prefix: "",
      markdownKind: undefined,
      language: undefined,
      isFirstContentLine: false,
      frame,
      style,
    },
    ...rows.map((row, index): TuiTranscriptLineView => ({
      id: `${entryId}-line-${index + 1}`,
      entryId,
      role: entry.role,
      kind: "content",
      text: row.text,
      spans: row.spans,
      prefix: row.prefix,
      markdownKind: row.markdownKind,
      language: row.language,
      isFirstContentLine: index === Math.max(0, firstContentIndex),
      frame,
      style: applyTranscriptMarkdownStyle(style, row.markdownKind, theme),
    })),
  ];
}

function createEmptyWrappedRow(): TuiTranscriptWrappedRow {
  return {
    markdownKind: undefined,
    language: undefined,
    prefix: "",
    text: "",
    spans: [],
  };
}

function readEntryDisplayRows(entry: TuiTranscriptEntry): TuiTranscriptSourceRow[] {
  if (entry.role === "assistant" || entry.role === "reasoning" || entry.role === "subagent" || entry.role === "subagent_reasoning") {
    const markdownRows = renderMarkdownLines(entry.text);
    return markdownRows.length > 0
      ? markdownRows.map((row) => ({
        markdownKind: row.kind as TuiMarkdownLineKind,
        text: row.text,
        spans: row.spans as readonly TuiMarkdownSpan[],
        language: row.language,
      }))
      : [{ markdownKind: undefined, text: "", spans: [], language: undefined }];
  }
  return entry.text.split(/\r?\n/).map((text) => ({
    markdownKind: undefined,
    text,
    spans: [{ text }],
    language: undefined,
  }));
}
