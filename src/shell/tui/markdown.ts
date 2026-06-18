import { marked, type Tokens } from "marked";

export type TuiMarkdownLineKind =
  | "text"
  | "heading"
  | "list"
  | "code"
  | "quote"
  | "table"
  | "rule";

export interface TuiMarkdownLine {
  readonly kind: TuiMarkdownLineKind;
  readonly text: string;
}

export function renderMarkdownLines(markdown: string): TuiMarkdownLine[] {
  const tokens = marked.lexer(markdown, {
    gfm: true,
  });
  const lines: TuiMarkdownLine[] = [];
  for (const token of tokens) {
    appendToken(lines, token);
  }
  return trimOuterBlankLines(lines);
}

function appendToken(lines: TuiMarkdownLine[], token: Tokens.Generic): void {
  switch (token.type) {
    case "heading":
      push(lines, "heading", inlineText(token.text as string));
      pushBlank(lines);
      return;
    case "paragraph":
      push(lines, "text", inlineText(token.text as string));
      pushBlank(lines);
      return;
    case "list":
      appendList(lines, token as Tokens.List);
      pushBlank(lines);
      return;
    case "code":
      appendCode(lines, token as Tokens.Code);
      pushBlank(lines);
      return;
    case "blockquote":
      appendBlockquote(lines, token as Tokens.Blockquote);
      pushBlank(lines);
      return;
    case "hr":
      push(lines, "rule", "────────");
      pushBlank(lines);
      return;
    case "space":
      pushBlank(lines);
      return;
    case "table":
      appendTable(lines, token as Tokens.Table);
      pushBlank(lines);
      return;
    default:
      if (typeof token.raw === "string" && token.raw.trim()) {
        push(lines, "text", stripMarkdownInline(token.raw));
        pushBlank(lines);
      }
  }
}

function appendList(lines: TuiMarkdownLine[], token: Tokens.List): void {
  const start = typeof token.start === "number" ? token.start : Number.parseInt(String(token.start ?? 1), 10);
  const orderedStart = Number.isFinite(start) ? start : 1;
  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${orderedStart + index}.` : "•";
    const text = inlineText(item.text);
    const itemLines = text.split("\n");
    push(lines, "list", `${marker} ${itemLines[0] ?? ""}`);
    for (const line of itemLines.slice(1)) {
      push(lines, "list", `  ${line}`);
    }
  });
}

function appendCode(lines: TuiMarkdownLine[], token: Tokens.Code): void {
  for (const line of token.text.split(/\r?\n/)) {
    push(lines, "code", line);
  }
}

function appendBlockquote(lines: TuiMarkdownLine[], token: Tokens.Blockquote): void {
  const nested = renderMarkdownLines(token.text);
  for (const line of nested) {
    push(lines, "quote", line.text ? `│ ${line.text}` : "│");
  }
}

function appendTable(lines: TuiMarkdownLine[], token: Tokens.Table): void {
  const header = token.header.map((cell) => inlineText(cell.text));
  const rows = token.rows.map((row) => row.map((cell) => inlineText(cell.text)));
  const widths = header.map((cell, index) => Math.max(
    cell.length,
    ...rows.map((row) => row[index]?.length ?? 0),
  ));
  push(lines, "table", joinTableRow(header, widths));
  push(lines, "table", widths.map((width) => "─".repeat(Math.max(3, width))).join("─┼─"));
  for (const row of token.rows) {
    push(lines, "table", joinTableRow(row.map((cell) => inlineText(cell.text)), widths));
  }
}

function joinTableRow(cells: readonly string[], widths: readonly number[]): string {
  return cells.map((cell, index) => cell.padEnd(widths[index] ?? cell.length)).join(" │ ");
}

function inlineText(text: string): string {
  return stripMarkdownInline(text).replace(/\s+\n/g, "\n").trimEnd();
}

function stripMarkdownInline(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/~~([^~]+)~~/g, "$1")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function push(lines: TuiMarkdownLine[], kind: TuiMarkdownLineKind, text: string): void {
  lines.push({ kind, text });
}

function pushBlank(lines: TuiMarkdownLine[]): void {
  push(lines, "text", "");
}

function trimOuterBlankLines(lines: TuiMarkdownLine[]): TuiMarkdownLine[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start]?.text === "") {
    start += 1;
  }
  while (end > start && lines[end - 1]?.text === "") {
    end -= 1;
  }
  return lines.slice(start, end);
}
