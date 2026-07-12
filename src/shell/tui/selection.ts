import stringWidth from "string-width";

import type {
  TuiSelectionPoint,
  TuiSelectionState,
  TuiTranscriptLineView,
  TuiViewport,
} from "./store.js";
import { TRANSCRIPT_OUTER_PADDING_X } from "./transcriptLayout.js";

export interface TuiLineSelectionRange {
  start: number;
  end: number;
}

export type TuiSelectableTranscriptLineView = TuiTranscriptLineView & {
  selection?: TuiLineSelectionRange;
};

export function projectMouseSelectionPoint(input: {
  rows: readonly TuiTranscriptLineView[];
  scrollOffset: number;
  viewport: TuiViewport;
  x: number;
  y: number;
}): TuiSelectionPoint | undefined {
  if (input.y < 1 || input.y > input.viewport.height) return undefined;
  const row = input.rows[input.scrollOffset + input.y - 1];
  if (!row || row.kind !== "content") return undefined;
  const text = selectableLineText(row);
  const bodyStart = TRANSCRIPT_OUTER_PADDING_X
    + row.frame.marginLeft
    + row.frame.paddingLeft
    + stringWidth(row.frame.gutter)
    + row.frame.gap;
  const terminalColumn = Math.max(0, input.x - 1 - bodyStart);
  return {
    rowId: row.id,
    column: stringIndexAtDisplayColumn(text, terminalColumn),
  };
}

export function projectSelectedLineViews(
  rows: readonly TuiTranscriptLineView[],
  selection: TuiSelectionState | undefined,
): TuiSelectableTranscriptLineView[] {
  if (!selection?.anchor || !selection.focus) return [...rows];
  const range = resolveSelectionRange(rows, selection.anchor, selection.focus);
  if (!range) return [...rows];
  return rows.map((row, index) => {
    if (index < range.startRow || index > range.endRow || row.kind !== "content") return row;
    const text = selectableLineText(row);
    const start = index === range.startRow ? range.startColumn : 0;
    const end = index === range.endRow ? range.endColumn : text.length;
    return end > start ? { ...row, selection: { start, end } } : row;
  });
}

export function readSelectedText(
  rows: readonly TuiTranscriptLineView[],
  selection: TuiSelectionState | undefined,
): string | undefined {
  if (!selection?.anchor || !selection.focus) return undefined;
  const range = resolveSelectionRange(rows, selection.anchor, selection.focus);
  if (!range) return undefined;
  const selected = rows
    .slice(range.startRow, range.endRow + 1)
    .map((row, relativeIndex) => {
      if (row.kind !== "content") return "";
      const text = selectableLineText(row);
      const rowIndex = range.startRow + relativeIndex;
      const start = rowIndex === range.startRow ? range.startColumn : 0;
      const end = rowIndex === range.endRow ? range.endColumn : text.length;
      return text.slice(start, end);
    })
    .join("\n");
  return selected.length > 0 ? selected : undefined;
}

export function selectableLineText(row: TuiTranscriptLineView): string {
  return `${row.prefix}${row.text}`;
}

function resolveSelectionRange(
  rows: readonly TuiTranscriptLineView[],
  anchorPoint: TuiSelectionPoint,
  focusPoint: TuiSelectionPoint,
): {
  startRow: number;
  startColumn: number;
  endRow: number;
  endColumn: number;
} | undefined {
  const anchorRow = rows.findIndex((row) => row.id === anchorPoint.rowId);
  const focusRow = rows.findIndex((row) => row.id === focusPoint.rowId);
  if (anchorRow < 0 || focusRow < 0) return undefined;
  const anchor = { row: anchorRow, column: anchorPoint.column };
  const focus = { row: focusRow, column: focusPoint.column };
  const forward = anchor.row < focus.row || (anchor.row === focus.row && anchor.column <= focus.column);
  const start = forward ? anchor : focus;
  const end = forward ? focus : anchor;
  return start.row === end.row && start.column === end.column
    ? undefined
    : {
        startRow: start.row,
        startColumn: start.column,
        endRow: end.row,
        endColumn: end.column,
      };
}

function stringIndexAtDisplayColumn(text: string, targetColumn: number): number {
  let displayColumn = 0;
  let stringIndex = 0;
  for (const character of Array.from(text)) {
    const width = stringWidth(character);
    if (displayColumn + width > targetColumn) return stringIndex;
    displayColumn += width;
    stringIndex += character.length;
  }
  return text.length;
}
