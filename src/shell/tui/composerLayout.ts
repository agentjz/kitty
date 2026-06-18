import stringWidth from "string-width";
import wrapAnsi from "wrap-ansi";

import { TUI_COMPOSER_MAX_ROWS, normalizeComposerRows } from "./layout.js";

export const COMPOSER_FRAME = {
  gap: 2,
  gutter: "┃",
  paddingX: 2,
  paddingY: 1,
  tabWidth: 2,
} as const;

export interface ComposerFrameMetrics {
  readonly hasMeasured: boolean;
  readonly left: number;
  readonly top: number;
  readonly width: number;
}

export interface ComposerLayoutInput {
  readonly contentWidth?: number;
  readonly cursor: number;
  readonly frame: ComposerFrameMetrics;
  readonly value: string;
}

export interface ComposerLayoutModel {
  readonly contentWidth: number;
  readonly cursor: { x: number; y: number } | undefined;
  readonly cursorCell: { x: number; y: number } | undefined;
  readonly rows: readonly string[];
  readonly visibleRows: number;
}

export function measureComposerContentWidth(containerWidth: number): number {
  return Math.max(
    1,
    Math.floor(containerWidth)
      - COMPOSER_FRAME.paddingX * 2
      - stringWidth(COMPOSER_FRAME.gutter)
      - COMPOSER_FRAME.gap,
  );
}

export function measureComposerTextOrigin(metrics: ComposerFrameMetrics): { x: number; y: number } | undefined {
  if (!metrics.hasMeasured) {
    return undefined;
  }
  return {
    x: metrics.left,
    y: metrics.top,
  };
}

export function layoutComposer(input: ComposerLayoutInput): ComposerLayoutModel {
  const contentWidth = Math.max(1, Math.floor(input.contentWidth ?? input.frame.width));
  const rows = wrapComposerRows(input.value, contentWidth);
  const visibleRows = normalizeComposerRows(rows.length);
  const visibleStart = Math.max(0, rows.length - visibleRows);
  const visible = rows.slice(visibleStart);
  const origin = measureComposerTextOrigin(input.frame);
  const cursor = origin
    ? measureComposerCursor({
      contentWidth,
      cursor: input.cursor,
      origin,
      rows,
      visibleStart,
      value: input.value,
    })
    : undefined;
  const cursorCell = measureComposerCursorCell({
    contentWidth,
    cursor: input.cursor,
    rows,
    visibleStart,
    value: input.value,
  });

  return {
    contentWidth,
    cursor,
    cursorCell,
    rows: visible,
    visibleRows,
  };
}

export function composeInkCursorPosition(input: {
  readonly cell: { x: number; y: number } | undefined;
  readonly fallback: { x: number; y: number } | undefined;
  readonly rowFrame: ComposerFrameMetrics;
}): { x: number; y: number } | undefined {
  if (!input.cell || !input.rowFrame.hasMeasured) {
    return input.fallback ? shiftInkCursorRow(input.fallback) : undefined;
  }
  return {
    x: input.rowFrame.left + input.cell.x,
    y: input.rowFrame.top + 1,
  };
}

function measureComposerCursor(input: {
  readonly contentWidth: number;
  readonly cursor: number;
  readonly origin: { x: number; y: number };
  readonly rows: readonly string[];
  readonly value: string;
  readonly visibleStart: number;
}): { x: number; y: number } {
  const cell = measureComposerCursorCell(input);
  return {
    x: input.origin.x + cell.x,
    y: input.origin.y + cell.y,
  };
}

function measureComposerCursorCell(input: {
  readonly contentWidth: number;
  readonly cursor: number;
  readonly rows: readonly string[];
  readonly value: string;
  readonly visibleStart: number;
}): { x: number; y: number } {
  const beforeCursor = input.value.slice(0, Math.max(0, Math.min(input.cursor, input.value.length)));
  const rowsBeforeCursor = wrapComposerRows(beforeCursor, input.contentWidth);
  const cursorRow = Math.max(0, rowsBeforeCursor.length - 1);
  const cursorVisibleRow = Math.max(0, cursorRow - input.visibleStart);
  const cursorLine = rowsBeforeCursor.at(-1) ?? "";
  return {
    x: Math.min(stringWidth(cursorLine), input.contentWidth),
    y: cursorVisibleRow,
  };
}

function shiftInkCursorRow(position: { x: number; y: number }): { x: number; y: number } {
  return {
    x: position.x,
    y: position.y + 1,
  };
}

function wrapComposerRows(value: string, width: number): string[] {
  const text = value || "";
  const rows = text.split(/\r?\n/).flatMap((line) => {
    const wrapped = wrapAnsi(line, width, { hard: true, trim: false });
    return wrapped.split(/\r?\n/).map((row) => row.trim() ? row : "");
  });
  return rows.length > 0 ? rows : [""];
}
