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
): TuiMarkdownLine[] {
  const headerTexts = header.map(readCellText);
  const rowTexts = rows.map((row) => row.map(readCellText));
  const widths = headerTexts.map((cell, index) => Math.max(
    stringWidth(cell),
    ...rowTexts.map((row) => stringWidth(row[index] ?? "")),
  ));

  return [
    tableLine(joinTableRow(headerTexts, widths)),
    tableLine(widths.map((width) => "─".repeat(Math.max(3, width))).join("─┼─")),
    ...rowTexts.map((row) => tableLine(joinTableRow(row, widths))),
  ];
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

function joinTableRow(cells: readonly string[], widths: readonly number[]): string {
  return cells
    .map((cell, index) => padDisplayEnd(cell, widths[index] ?? stringWidth(cell)))
    .join(" │ ");
}

function padDisplayEnd(text: string, width: number): string {
  return `${text}${" ".repeat(Math.max(0, width - stringWidth(text)))}`;
}
