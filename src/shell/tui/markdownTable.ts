import stringWidth from "string-width";

import { renderInlineText } from "./markdownInline.js";
import type { TuiMarkdownLine } from "./markdownTypes.js";

export interface TuiMarkdownTableCell {
  readonly text: string;
  readonly tokens?: readonly import("marked").Token[];
}

export function renderMarkdownTableLines(
  header: readonly TuiMarkdownTableCell[],
  rows: readonly (readonly TuiMarkdownTableCell[])[],
  options: { width?: number } = {},
): TuiMarkdownLine[] {
  const headerTexts = header.map(readCellText);
  const rowTexts = rows.map((row) => row.map(readCellText));
  const widths = headerTexts.map((cell, index) => Math.max(
    stringWidth(cell),
    ...rowTexts.map((row) => stringWidth(row[index] ?? "")),
  ));

  const grid = renderGridTable(headerTexts, rowTexts, widths);
  const width = normalizeWidth(options.width);
  return width !== undefined && grid.some((row) => stringWidth(row.text) > width)
    ? renderRecordTable(headerTexts, rowTexts, width)
    : grid;
}

function readCellText(cell: TuiMarkdownTableCell): string {
  return cell.tokens ? renderInlineText(cell.tokens) : renderInlineText(cell.text);
}

function tableLine(text: string): TuiMarkdownLine {
  return {
    kind: "table",
    text,
    spans: [{ text }],
  };
}

function renderGridTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  widths: readonly number[],
): TuiMarkdownLine[] {
  const border = (left: string, middle: string, right: string) =>
    tableLine(`${left}${widths.map((width) => "─".repeat(width + 2)).join(middle)}${right}`);
  return [
    border("┌", "┬", "┐"),
    gridRow(header, widths, true),
    border("├", "┼", "┤"),
    ...rows.map((row) => gridRow(row, widths, false)),
    border("└", "┴", "┘"),
  ];
}

function gridRow(cells: readonly string[], widths: readonly number[], header: boolean): TuiMarkdownLine {
  const text = `│ ${cells
    .map((cell, index) => padDisplayEnd(cell, widths[index] ?? stringWidth(cell)))
    .join(" │ ")} │`;
  return {
    kind: "table",
    text,
    spans: [{ text, bold: header }],
  };
}

function renderRecordTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  width: number,
): TuiMarkdownLine[] {
  const lines: TuiMarkdownLine[] = [];
  rows.forEach((row, rowIndex) => {
    headers.forEach((header, columnIndex) => {
      const label = header || `Column ${columnIndex + 1}`;
      const value = row[columnIndex] ?? "";
      lines.push({
        kind: "table",
        text: `${label}: ${value}`,
        spans: [{ text: `${label}: `, bold: true }, { text: value }],
      });
    });
    if (rowIndex < rows.length - 1) {
      lines.push(tableLine("─".repeat(Math.max(3, Math.min(width, 24)))));
    }
  });
  return lines.length > 0 ? lines : [gridRow(headers, headers.map((header) => stringWidth(header)), true)];
}

function padDisplayEnd(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - stringWidth(text)))}`;
}

function normalizeWidth(width: number | undefined): number | undefined {
  return typeof width === "number" && Number.isFinite(width)
    ? Math.max(1, Math.floor(width))
    : undefined;
}
