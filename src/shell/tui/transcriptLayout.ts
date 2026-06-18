import wrapAnsi from "wrap-ansi";
import stringWidth from "string-width";

import { renderMarkdownLines } from "./markdown.js";

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
  prefix: string;
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
  italicPrefix: boolean;
}

export interface TuiTranscriptTheme {
  background: string;
  border: string;
  panel: string;
  panelStrong: string;
  text: string;
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
  return entries.flatMap((entry) => renderEntryLineViews(entry, viewportWidth, theme));
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

function renderEntryLineViews(
  entry: TuiTranscriptEntry,
  viewportWidth: number,
  theme: TuiTranscriptTheme,
): TuiTranscriptLineView[] {
  const frame = readRoleFrame(entry.role, viewportWidth);
  const style = readRoleStyle(entry.role, theme);
  const sourceRows = readEntryDisplayRows(entry);
  const contentRows = wrapEntryRows(entry, sourceRows, frame.bodyWidth);
  const rows = contentRows.length > 0 ? contentRows : [{ prefix: "", text: "" }];
  const entryId = entry.id;
  return [
    {
      id: `${entryId}-spacer`,
      entryId,
      role: entry.role,
      kind: "spacer",
      text: "",
      prefix: "",
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
      prefix: row.prefix,
      isFirstContentLine: index === 0,
      frame,
      style,
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
        italicPrefix: false,
      };
    case "reasoning":
      return {
        accent: theme.border,
        background: undefined,
        text: theme.reasoning,
        bold: false,
        italicPrefix: true,
      };
    case "system":
      return {
        accent: theme.border,
        background: theme.panel,
        text: theme.system,
        bold: false,
        italicPrefix: false,
      };
    case "assistant":
      return {
        accent: theme.background,
        background: undefined,
        text: theme.assistant,
        bold: false,
        italicPrefix: false,
      };
  }
}

function readEntryDisplayRows(entry: TuiTranscriptEntry): string[] {
  if (entry.role === "assistant" || entry.role === "reasoning") {
    const markdownRows = renderMarkdownLines(entry.text);
    return markdownRows.length > 0 ? markdownRows : [""];
  }
  return entry.text.split(/\r?\n/);
}

function wrapEntryRows(
  entry: TuiTranscriptEntry,
  sourceRows: readonly string[],
  bodyWidth: number,
): Array<{ prefix: string; text: string }> {
  if (entry.role !== "reasoning") {
    return sourceRows.flatMap((line) => wrapText(line, bodyWidth).map((text) => ({ prefix: "", text })));
  }

  const rows: Array<{ prefix: string; text: string }> = [];
  const firstBodyWidth = Math.max(1, bodyWidth - stringWidth(REASONING_PREFIX));
  sourceRows.forEach((line, sourceIndex) => {
    const width = sourceIndex === 0 ? firstBodyWidth : bodyWidth;
    const wrapped = wrapText(line, width);
    wrapped.forEach((text, wrappedIndex) => {
      rows.push({
        prefix: sourceIndex === 0 && wrappedIndex === 0 ? REASONING_PREFIX : "",
        text,
      });
    });
  });
  return rows;
}

function wrapText(text: string, width: number): string[] {
  const rows: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const wrapped = wrapAnsi(line, width, { hard: true, trim: false });
    rows.push(...wrapped.split(/\r?\n/));
  }
  return rows.length > 0 ? rows : [""];
}
