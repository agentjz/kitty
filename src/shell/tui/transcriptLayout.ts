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
import { wrapTranscriptEntryRows, type TuiTranscriptSourceRow } from "./transcriptWrap.js";

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
): TuiTranscriptLineView[] {
  return entries.flatMap((entry) => renderTranscriptEntryLineViews(entry, viewportWidth, theme));
}

export function renderTranscriptRows(
  entries: readonly TuiTranscriptEntry[],
  viewportWidth: number,
  theme: TuiTranscriptTheme,
): string[] {
  return renderTranscriptLineViews(entries, viewportWidth, theme).map((line) => line.text);
}

export function measureTranscriptRows(
  entries: readonly TuiTranscriptEntry[],
  viewportWidth: number,
  theme: TuiTranscriptTheme,
): number {
  return renderTranscriptLineViews(entries, viewportWidth, theme).length;
}

export function renderTranscriptEntryLineViews(
  entry: TuiTranscriptEntry,
  viewportWidth: number,
  theme: TuiTranscriptTheme,
): TuiTranscriptLineView[] {
  const frame = readTranscriptRoleFrame(entry.role, viewportWidth);
  const style = readTranscriptRoleStyle(entry.role, theme);
  const sourceRows = readEntryDisplayRows(entry);
  const contentRows = wrapTranscriptEntryRows(entry, sourceRows, frame.bodyWidth);
  const rows = contentRows.length > 0
    ? contentRows
    : [{ markdownKind: undefined, language: undefined, prefix: "", text: "", spans: [] }];
  const entryId = entry.id;
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
      isFirstContentLine: index === 0,
      frame,
      style: applyTranscriptMarkdownStyle(style, row.markdownKind, theme),
    })),
  ];
}

function readEntryDisplayRows(entry: TuiTranscriptEntry): TuiTranscriptSourceRow[] {
  if (entry.role === "assistant" || entry.role === "reasoning") {
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
