import stringWidth from "string-width";

import { renderMarkdownLines, type TuiMarkdownLineKind, type TuiMarkdownSpan } from "./markdown.js";

export type TuiTranscriptRole = "user" | "assistant" | "reasoning" | "system";

export interface TuiTranscriptEntry {
  id: string;
  role: TuiTranscriptRole;
  text: string;
}

export interface TuiTranscriptLineView {
  id: string;
  entryId: string;
  role: TuiTranscriptRole;
  kind: "spacer" | "content";
  text: string;
  spans: readonly TuiTranscriptLineSpan[];
  prefix: string;
  markdownKind: TuiMarkdownLineKind | undefined;
  language: string | undefined;
  isFirstContentLine: boolean;
  frame: TuiTranscriptLineFrame;
  style: TuiTranscriptLineStyle;
}

export interface TuiTranscriptLineFrame {
  bodyWidth: number;
  gap: number;
  gutter: string;
  marginLeft: number;
  paddingLeft: number;
  paddingRight: number;
}

export interface TuiTranscriptLineStyle {
  accent: string;
  background: string | undefined;
  text: string;
  bold: boolean;
  dim: boolean;
  italicPrefix: boolean;
}

export interface TuiTranscriptLineSpan {
  readonly text: string;
  readonly bold: boolean;
  readonly italic: boolean;
  readonly code: boolean;
  readonly dim: boolean;
  readonly strike: boolean;
  readonly href: string | undefined;
}

export interface TuiTranscriptTheme {
  background: string;
  border: string;
  panel: string;
  panelStrong: string;
  text: string;
  muted: string;
  user: string;
  assistant: string;
  reasoning: string;
  thought: string;
  system: string;
}

export const TRANSCRIPT_OUTER_PADDING_X = 3;

const MIN_BODY_WIDTH = 8;
const REASONING_PREFIX = "Thinking: ";

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
  const frame = readRoleFrame(entry.role, viewportWidth);
  const style = readRoleStyle(entry.role, theme);
  const sourceRows = readEntryDisplayRows(entry);
  const contentRows = wrapEntryRows(entry, sourceRows, frame.bodyWidth);
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
      style: applyMarkdownStyle(style, row.markdownKind, theme),
    })),
  ];
}

function readRoleFrame(role: TuiTranscriptRole, viewportWidth: number): TuiTranscriptLineFrame {
  const frameWidth = Math.max(1, viewportWidth - TRANSCRIPT_OUTER_PADDING_X * 2);
  const base = readRoleFrameBase(role);
  const bodyWidth = Math.max(
    MIN_BODY_WIDTH,
    frameWidth - base.marginLeft - base.paddingLeft - base.paddingRight - stringWidth(base.gutter) - base.gap,
  );
  return {
    ...base,
    bodyWidth,
  };
}

function readRoleFrameBase(role: TuiTranscriptRole): Omit<TuiTranscriptLineFrame, "bodyWidth"> {
  switch (role) {
    case "user":
      return {
        gap: 2,
        gutter: "┃",
        marginLeft: 1,
        paddingLeft: 1,
        paddingRight: 1,
      };
    case "reasoning":
      return {
        gap: 2,
        gutter: "┃",
        marginLeft: 1,
        paddingLeft: 1,
        paddingRight: 1,
      };
    case "system":
      return {
        gap: 2,
        gutter: "│",
        marginLeft: 2,
        paddingLeft: 1,
        paddingRight: 1,
      };
    case "assistant":
      return {
        gap: 2,
        gutter: " ",
        marginLeft: 2,
        paddingLeft: 1,
        paddingRight: 1,
      };
  }
}

function readRoleStyle(role: TuiTranscriptRole, theme: TuiTranscriptTheme): TuiTranscriptLineStyle {
  switch (role) {
    case "user":
      return {
        accent: theme.user,
        background: theme.panelStrong,
        text: theme.text,
        bold: true,
        dim: false,
        italicPrefix: false,
      };
    case "reasoning":
      return {
        accent: theme.border,
        background: undefined,
        text: theme.reasoning,
        bold: false,
        dim: true,
        italicPrefix: true,
      };
    case "system":
      return {
        accent: theme.border,
        background: theme.panel,
        text: theme.system,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
    case "assistant":
      return {
        accent: theme.background,
        background: undefined,
        text: theme.assistant,
        bold: false,
        dim: false,
        italicPrefix: false,
      };
  }
}

interface TuiTranscriptSourceRow {
  readonly markdownKind: TuiMarkdownLineKind | undefined;
  readonly text: string;
  readonly spans: readonly TuiMarkdownSpan[];
  readonly language: string | undefined;
}

function readEntryDisplayRows(entry: TuiTranscriptEntry): TuiTranscriptSourceRow[] {
  if (entry.role === "assistant" || entry.role === "reasoning") {
    const markdownRows = renderMarkdownLines(entry.text);
    return markdownRows.length > 0
      ? markdownRows.map((row) => ({
        markdownKind: row.kind,
        text: row.text,
        spans: row.spans,
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

function wrapEntryRows(
  entry: TuiTranscriptEntry,
  sourceRows: readonly TuiTranscriptSourceRow[],
  bodyWidth: number,
): Array<{
  markdownKind: TuiMarkdownLineKind | undefined;
  language: string | undefined;
  prefix: string;
  text: string;
  spans: readonly TuiTranscriptLineSpan[];
}> {
  if (entry.role !== "reasoning") {
    return sourceRows.flatMap((line) => wrapSourceRow(line, bodyWidth, ""));
  }

  const rows: Array<{
    markdownKind: TuiMarkdownLineKind | undefined;
    language: string | undefined;
    prefix: string;
    text: string;
    spans: readonly TuiTranscriptLineSpan[];
  }> = [];
  const firstBodyWidth = Math.max(1, bodyWidth - stringWidth(REASONING_PREFIX));
  sourceRows.forEach((line, sourceIndex) => {
    const width = sourceIndex === 0 ? firstBodyWidth : bodyWidth;
    const prefix = sourceIndex === 0 ? REASONING_PREFIX : "";
    rows.push(...wrapSourceRow(line, width, prefix));
  });
  return rows;
}

function wrapSourceRow(
  source: TuiTranscriptSourceRow,
  width: number,
  firstPrefix: string,
): Array<{
  markdownKind: TuiMarkdownLineKind | undefined;
  language: string | undefined;
  prefix: string;
  text: string;
  spans: readonly TuiTranscriptLineSpan[];
}> {
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

function applyMarkdownStyle(
  base: TuiTranscriptLineStyle,
  kind: TuiMarkdownLineKind | undefined,
  theme: TuiTranscriptTheme,
): TuiTranscriptLineStyle {
  switch (kind) {
    case "heading":
      return {
        ...base,
        text: theme.user,
        bold: true,
      };
    case "code":
      return {
        ...base,
        background: theme.panel,
        text: theme.system,
      };
    case "quote":
      return {
        ...base,
        text: theme.reasoning,
        dim: true,
      };
    case "rule":
    case "table":
      return {
        ...base,
        text: theme.muted,
      };
    case "list":
    case "text":
    case undefined:
      return base;
  }
}
