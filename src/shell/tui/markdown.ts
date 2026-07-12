import { marked, type Token, type Tokens } from "marked";

import { renderInlineSpans, renderInlineText, textSpan } from "./markdownInline.js";
import { renderMarkdownTableLines } from "./markdownTable.js";
import type { TuiMarkdownLine, TuiMarkdownLineKind, TuiMarkdownSpan } from "./markdownTypes.js";

export type {
  TuiMarkdownLine,
  TuiMarkdownLineKind,
  TuiMarkdownSpan,
} from "./markdownTypes.js";

const MARKED_OPTIONS = { gfm: true };

export function renderMarkdownLines(markdown: string, options: { width?: number } = {}): TuiMarkdownLine[] {
  try {
    const tokens = marked.lexer(markdown, MARKED_OPTIONS);
    const lines: TuiMarkdownLine[] = [];
    for (const token of tokens) {
      appendToken(lines, token, options);
    }
    return trimOuterBlankLines(lines);
  } catch {
    return markdown.split(/\r?\n/).map((text) => line("text", text, textSpan(text)));
  }
}

function appendToken(lines: TuiMarkdownLine[], token: Token, options: { width?: number }): void {
  switch (token.type) {
    case "heading":
      appendInlineLine(lines, "heading", (token as Tokens.Heading).tokens);
      pushBlank(lines);
      return;
    case "paragraph":
      appendInlineLine(lines, "text", (token as Tokens.Paragraph).tokens);
      pushBlank(lines);
      return;
    case "list":
      appendList(lines, token as Tokens.List, options);
      pushBlank(lines);
      return;
    case "code":
      appendCode(lines, token as Tokens.Code, options);
      pushBlank(lines);
      return;
    case "blockquote":
      appendBlockquote(lines, token as Tokens.Blockquote, options);
      pushBlank(lines);
      return;
    case "hr":
      push(lines, line("rule", "────────", textSpan("────────")));
      pushBlank(lines);
      return;
    case "space":
      pushBlank(lines);
      return;
    case "table":
      lines.push(...renderMarkdownTableLines(
        (token as Tokens.Table).header,
        (token as Tokens.Table).rows,
        options,
      ));
      pushBlank(lines);
      return;
    default:
      appendUnknownToken(lines, token);
  }
}

function appendInlineLine(lines: TuiMarkdownLine[], kind: TuiMarkdownLineKind, tokens: readonly Token[]): void {
  const spans = renderInlineSpans(tokens);
  const text = spans.map((span) => span.text).join("").trimEnd();
  push(lines, line(kind, text, trimEndSpans(spans)));
}

function appendList(lines: TuiMarkdownLine[], token: Tokens.List, options: { width?: number }): void {
  const start = typeof token.start === "number" ? token.start : Number.parseInt(String(token.start || 1), 10);
  const orderedStart = Number.isFinite(start) ? start : 1;
  token.items.forEach((item, index) => {
    const marker = token.ordered ? `${orderedStart + index}.` : "•";
    const task = item.task ? (item.checked ? "[x] " : "[ ] ") : "";
    const markerText = `${marker} ${task}`;
    const rendered = renderNestedLines(item.tokens, options);
    const nested = token.loose || item.loose ? rendered : rendered.filter((itemLine) => itemLine.text.length > 0);
    const itemLines = nested.length > 0
      ? nested
      : [line("text", renderInlineText(item.text), renderInlineSpans(item.text))];
    itemLines.forEach((itemLine, rowIndex) => {
      const prefix = rowIndex === 0 ? markerText : " ".repeat(markerText.length);
      const lineSpans = itemLine.text
        ? [...textSpan(prefix, { bold: rowIndex === 0 }), ...itemLine.spans]
        : [];
      push(lines, line(
        itemLine.kind === "text" ? "list" : itemLine.kind,
        spansText(lineSpans),
        lineSpans,
        itemLine.language,
      ));
    });
  });
}

function appendCode(lines: TuiMarkdownLine[], token: Tokens.Code, options: { width?: number }): void {
  const language = normalizeLanguage(token.lang);
  if (language === "md" || language === "markdown") {
    const nestedTokens = marked.lexer(token.text, MARKED_OPTIONS);
    if (nestedTokens.some((nested) => nested.type === "table")) {
      for (const nested of nestedTokens) {
        appendToken(lines, nested, options);
      }
      return;
    }
  }
  if (language) {
    const text = ` ${language} `;
    push(lines, line("code", text, textSpan(text, { code: true }), language));
  }
  for (const codeLine of token.text.split(/\r?\n/)) {
    push(lines, line("code", codeLine, textSpan(codeLine, { code: true }), language));
  }
}

function appendBlockquote(lines: TuiMarkdownLine[], token: Tokens.Blockquote, options: { width?: number }): void {
  const nested = token.tokens.length > 0 ? renderNestedLines(token.tokens, options) : renderMarkdownLines(token.text, options);
  for (const nestedLine of nested) {
    const prefix = nestedLine.text ? "│ " : "│";
    const spans = nestedLine.text
      ? [...textSpan("│ ", { italic: true }), ...nestedLine.spans]
      : textSpan("│", { italic: true });
    push(lines, line("quote", `${prefix}${nestedLine.text}`, spans));
  }
}

function renderNestedLines(tokens: readonly Token[], options: { width?: number }): TuiMarkdownLine[] {
  const lines: TuiMarkdownLine[] = [];
  for (const token of tokens) {
    appendToken(lines, token, options);
  }
  return trimOuterBlankLines(lines);
}

function appendUnknownToken(lines: TuiMarkdownLine[], token: Token): void {
  if ("tokens" in token && Array.isArray(token.tokens)) {
    appendInlineLine(lines, "text", token.tokens);
    pushBlank(lines);
    return;
  }
  const text = "text" in token && typeof token.text === "string"
    ? renderInlineText(token.text)
    : "raw" in token && typeof token.raw === "string"
      ? token.raw
      : "";
  if (text.trim()) {
    push(lines, line("text", text, textSpan(text)));
    pushBlank(lines);
  }
}

function trimEndSpans(spans: readonly TuiMarkdownSpan[]): TuiMarkdownSpan[] {
  const next = spans.slice();
  while (next.length > 0) {
    const last = next[next.length - 1]!;
    const trimmed = last.text.trimEnd();
    if (trimmed.length === last.text.length) {
      break;
    }
    if (trimmed) {
      next[next.length - 1] = { ...last, text: trimmed };
      break;
    }
    next.pop();
  }
  return next;
}

function normalizeLanguage(language: string | undefined): string | undefined {
  const [name] = (language ?? "").trim().split(/\s+/);
  return name || undefined;
}

function line(
  kind: TuiMarkdownLineKind,
  text: string,
  spans: readonly TuiMarkdownSpan[],
  language?: string,
): TuiMarkdownLine {
  return {
    kind,
    text,
    spans,
    language,
  };
}

function push(lines: TuiMarkdownLine[], next: TuiMarkdownLine): void {
  lines.push(next);
}

function pushBlank(lines: TuiMarkdownLine[]): void {
  push(lines, line("text", "", []));
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

function spansText(spans: readonly TuiMarkdownSpan[]): string {
  return spans.map((span) => span.text).join("");
}
