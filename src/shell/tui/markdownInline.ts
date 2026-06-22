import { Lexer, type Token, type Tokens } from "marked";

import type { TuiMarkdownSpan } from "./markdownTypes.js";

interface InlineMarks {
  readonly bold?: boolean;
  readonly italic?: boolean;
  readonly code?: boolean;
  readonly strike?: boolean;
  readonly href?: string;
}

const MARKED_OPTIONS = { gfm: true };

export function renderInlineSpans(source: string | readonly Token[]): TuiMarkdownSpan[] {
  const tokens = typeof source === "string"
    ? Lexer.lexInline(source, MARKED_OPTIONS)
    : source;
  return compactSpans(tokens.flatMap((token) => renderInlineToken(token, {})));
}

export function renderInlineText(source: string | readonly Token[]): string {
  return renderInlineSpans(source).map((span) => span.text).join("");
}

export function textSpan(text: string, marks: InlineMarks = {}): TuiMarkdownSpan[] {
  return text ? [{ text, ...marks }] : [];
}

function renderInlineToken(token: Token, marks: InlineMarks): TuiMarkdownSpan[] {
  switch (token.type) {
    case "text":
    case "escape":
      return textSpan((token as Tokens.Text | Tokens.Escape).text, marks);
    case "codespan":
      return textSpan((token as Tokens.Codespan).text, { ...marks, code: true });
    case "strong":
      return renderInlineSpansWithMarks((token as Tokens.Strong).tokens, { ...marks, bold: true });
    case "em":
      return renderInlineSpansWithMarks((token as Tokens.Em).tokens, { ...marks, italic: true });
    case "del":
      return renderInlineSpansWithMarks((token as Tokens.Del).tokens, { ...marks, strike: true });
    case "link":
      return renderLinkToken(token as Tokens.Link, marks);
    case "image":
      return textSpan((token as Tokens.Image).text, marks);
    case "br":
      return textSpan("\n", marks);
    case "html":
      return renderHtmlInline((token as Tokens.HTML).text, marks);
    default:
      return renderGenericToken(token, marks);
  }
}

function renderInlineSpansWithMarks(tokens: readonly Token[], marks: InlineMarks): TuiMarkdownSpan[] {
  return compactSpans(tokens.flatMap((token) => renderInlineToken(token, marks)));
}

function renderLinkToken(token: Tokens.Link, marks: InlineMarks): TuiMarkdownSpan[] {
  const linked = renderInlineSpansWithMarks(token.tokens, { ...marks, href: token.href });
  const visible = linked.map((span) => span.text).join("");
  if (!token.href || token.href === visible) {
    return linked;
  }
  return compactSpans([
    ...linked,
    ...textSpan(` (${token.href})`, { ...marks, href: token.href }),
  ]);
}

function renderHtmlInline(text: string, marks: InlineMarks): TuiMarkdownSpan[] {
  if (/^<br\s*\/?>$/i.test(text.trim())) {
    return textSpan("\n", marks);
  }
  return textSpan(decodeHtmlEntities(text), marks);
}

function renderGenericToken(token: Token, marks: InlineMarks): TuiMarkdownSpan[] {
  if ("tokens" in token && Array.isArray(token.tokens)) {
    return renderInlineSpansWithMarks(token.tokens, marks);
  }
  if ("text" in token && typeof token.text === "string") {
    return textSpan(token.text, marks);
  }
  if ("raw" in token && typeof token.raw === "string") {
    return textSpan(token.raw, marks);
  }
  return [];
}

function compactSpans(spans: readonly TuiMarkdownSpan[]): TuiMarkdownSpan[] {
  const compacted: TuiMarkdownSpan[] = [];
  for (const span of spans) {
    if (!span.text) {
      continue;
    }
    const last = compacted[compacted.length - 1];
    if (last && sameMarks(last, span)) {
      compacted[compacted.length - 1] = { ...last, text: `${last.text}${span.text}` };
      continue;
    }
    compacted.push(span);
  }
  return compacted;
}

function sameMarks(left: TuiMarkdownSpan, right: TuiMarkdownSpan): boolean {
  return left.bold === right.bold
    && left.italic === right.italic
    && left.code === right.code
    && left.strike === right.strike
    && left.href === right.href;
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}
