import stringWidth from "string-width";

import type { TuiMarkdownLineKind, TuiMarkdownSpan } from "./markdown.js";
import type { TuiTranscriptEntry, TuiTranscriptLineSpan } from "./transcriptTypes.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../../i18n/index.js";

export interface TuiTranscriptSourceRow {
  readonly markdownKind: TuiMarkdownLineKind | undefined;
  readonly text: string;
  readonly spans: readonly TuiMarkdownSpan[];
  readonly language: string | undefined;
}

export interface TuiTranscriptWrappedRow {
  readonly markdownKind: TuiMarkdownLineKind | undefined;
  readonly language: string | undefined;
  readonly prefix: string;
  readonly text: string;
  readonly spans: readonly TuiTranscriptLineSpan[];
}

export function wrapTranscriptEntryRows(
  entry: TuiTranscriptEntry,
  sourceRows: readonly TuiTranscriptSourceRow[],
  bodyWidth: number,
  locale: KittyLocale = DEFAULT_LOCALE,
): TuiTranscriptWrappedRow[] {
  if (entry.role !== "reasoning") {
    return sourceRows.flatMap((line) => wrapSourceRow(line, bodyWidth, ""));
  }

  const reasoningPrefix = `${translate(locale, "runtime.reasoning")}: `;
  const rows: TuiTranscriptWrappedRow[] = [];
  const firstBodyWidth = Math.max(1, bodyWidth - stringWidth(reasoningPrefix));
  sourceRows.forEach((line, sourceIndex) => {
    const width = sourceIndex === 0 ? firstBodyWidth : bodyWidth;
    const prefix = sourceIndex === 0 ? reasoningPrefix : "";
    rows.push(...wrapSourceRow(line, width, prefix));
  });
  return rows;
}

function wrapSourceRow(
  source: TuiTranscriptSourceRow,
  width: number,
  firstPrefix: string,
): TuiTranscriptWrappedRow[] {
  const spanRows = wrapMarkdownSpans(source.spans.length > 0 ? source.spans : [{ text: source.text }], width);
  return spanRows.map((spans, index) => ({
    markdownKind: source.markdownKind,
    language: source.language,
    prefix: index === 0 ? firstPrefix : "",
    text: transcriptSpansText(spans),
    spans,
  }));
}

function wrapMarkdownSpans(spans: readonly TuiMarkdownSpan[], width: number): TuiTranscriptLineSpan[][] {
  const rows: TuiTranscriptLineSpan[][] = [[]];
  let cursorWidth = 0;
  for (const span of spans) {
    const parts = span.text.split(/\r?\n/);
    parts.forEach((part, partIndex) => {
      if (partIndex > 0) {
        rows.push([]);
        cursorWidth = 0;
      }
      cursorWidth = appendWrappedSpan(rows, cursorWidth, span, part, width);
    });
  }
  return rows.length > 0 ? rows : [[]];
}

function appendWrappedSpan(
  rows: TuiTranscriptLineSpan[][],
  cursorWidth: number,
  span: TuiMarkdownSpan,
  text: string,
  width: number,
): number {
  if (!text) {
    return cursorWidth;
  }
  let nextCursor = cursorWidth;
  for (const segment of splitWrapSegments(text)) {
    const segmentWidth = stringWidth(segment);
    const isBlank = segment.trim() === "";
    if (!isBlank && nextCursor > 0 && nextCursor + segmentWidth > width) {
      rows.push([]);
      nextCursor = 0;
    }
    const chunks = splitSegmentByWidth(segment, Math.max(1, width), nextCursor);
    for (const chunk of chunks) {
      if (chunk.newRow) {
        rows.push([]);
        nextCursor = 0;
      }
      pushTranscriptSpan(rows[rows.length - 1]!, toTranscriptSpan(span, chunk.text));
      nextCursor += stringWidth(chunk.text);
    }
  }
  return nextCursor;
}

function splitWrapSegments(text: string): string[] {
  return text.match(/\s+|\S+/gu) ?? [];
}

function splitSegmentByWidth(
  segment: string,
  width: number,
  cursorWidth: number,
): Array<{ text: string; newRow: boolean }> {
  const rows: Array<{ text: string; newRow: boolean }> = [];
  let current = "";
  let currentWidth = cursorWidth;
  for (const char of Array.from(segment)) {
    const charWidth = stringWidth(char);
    if (current && currentWidth + charWidth > width) {
      rows.push({ text: current, newRow: rows.length > 0 || cursorWidth > 0 });
      current = "";
      currentWidth = 0;
    }
    if (!current && currentWidth > 0 && currentWidth + charWidth > width) {
      rows.push({ text: "", newRow: true });
      currentWidth = 0;
    }
    current += char;
    currentWidth += charWidth;
  }
  if (current) {
    rows.push({ text: current, newRow: rows.length > 0 && rows[rows.length - 1]?.text !== "" });
  }
  return rows;
}

function toTranscriptSpan(span: TuiMarkdownSpan, text: string): TuiTranscriptLineSpan {
  return {
    text,
    bold: span.bold ?? false,
    italic: span.italic ?? false,
    code: span.code ?? false,
    dim: false,
    strike: span.strike ?? false,
    href: span.href,
  };
}

function pushTranscriptSpan(row: TuiTranscriptLineSpan[], span: TuiTranscriptLineSpan): void {
  if (!span.text) {
    return;
  }
  const last = row[row.length - 1];
  if (last && sameTranscriptSpanStyle(last, span)) {
    row[row.length - 1] = { ...last, text: `${last.text}${span.text}` };
    return;
  }
  row.push(span);
}

function sameTranscriptSpanStyle(left: TuiTranscriptLineSpan, right: TuiTranscriptLineSpan): boolean {
  return left.bold === right.bold
    && left.italic === right.italic
    && left.code === right.code
    && left.dim === right.dim
    && left.strike === right.strike
    && left.href === right.href;
}

function transcriptSpansText(spans: readonly TuiTranscriptLineSpan[]): string {
  return spans.map((span) => span.text).join("");
}
