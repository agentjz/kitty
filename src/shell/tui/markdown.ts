import { marked, type Tokens } from "marked";

export function renderMarkdownLines(markdown: string): string[] {
  const tokens = marked.lexer(markdown, {
    gfm: true,
  });
  const lines: string[] = [];
  for (const token of tokens) {
    appendToken(lines, token);
  }
  return trimOuterBlankLines(lines);
}

function appendToken(lines: string[], token: Tokens.Generic): void {
  switch (token.type) {
    case "heading":
      lines.push(`${"#".repeat(token.depth as number)} ${inlineText(token.text as string)}`);
      lines.push("");
      return;
    case "paragraph":
      lines.push(inlineText(token.text as string));
      lines.push("");
      return;
    case "list":
      appendList(lines, token as Tokens.List);
      lines.push("");
      return;
    case "code":
      appendCode(lines, token as Tokens.Code);
      lines.push("");
      return;
    case "blockquote":
      appendBlockquote(lines, token as Tokens.Blockquote);
      lines.push("");
      return;
    case "hr":
      lines.push("---");
      lines.push("");
      return;
    case "space":
      lines.push("");
      return;
    case "table":
      appendTable(lines, token as Tokens.Table);
      lines.push("");
      return;
    default:
      if (typeof token.raw === "string" && token.raw.trim()) {
        lines.push(stripMarkdownInline(token.raw));
        lines.push("");
      }
  }
}

function appendList(lines: string[], token: Tokens.List): void {
  const start = typeof token.start === "number" ? token.start : Number.parseInt(String(token.start ?? 1), 10);
  const orderedStart = Number.isFinite(start) ? start : 1;
  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${orderedStart + index}.` : "-";
    const text = inlineText(item.text);
    const itemLines = text.split("\n");
    lines.push(`${marker} ${itemLines[0] ?? ""}`);
    for (const line of itemLines.slice(1)) {
      lines.push(`  ${line}`);
    }
  });
}

function appendCode(lines: string[], token: Tokens.Code): void {
  const language = token.lang ?? "";
  lines.push(`\`\`\`${language}`);
  for (const line of token.text.split(/\r?\n/)) {
    lines.push(line);
  }
  lines.push("```");
}

function appendBlockquote(lines: string[], token: Tokens.Blockquote): void {
  const nested = renderMarkdownLines(token.text);
  for (const line of nested) {
    lines.push(line ? `> ${line}` : ">");
  }
}

function appendTable(lines: string[], token: Tokens.Table): void {
  const header = token.header.map((cell) => inlineText(cell.text));
  lines.push(header.join(" | "));
  lines.push(header.map(() => "---").join(" | "));
  for (const row of token.rows) {
    lines.push(row.map((cell) => inlineText(cell.text)).join(" | "));
  }
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

function trimOuterBlankLines(lines: string[]): string[] {
  let start = 0;
  let end = lines.length;
  while (start < end && lines[start] === "") {
    start += 1;
  }
  while (end > start && lines[end - 1] === "") {
    end -= 1;
  }
  return lines.slice(start, end);
}
