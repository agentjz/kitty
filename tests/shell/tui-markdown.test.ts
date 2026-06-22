import assert from "node:assert/strict";
import test from "node:test";

import { renderMarkdownLines } from "../../src/shell/tui/markdown.js";
import { renderTranscriptLineViews } from "../../src/shell/tui/store.js";

test("tui markdown keeps inline spans as display facts", () => {
  const [line] = renderMarkdownLines("Hello **bold** *em* `code` [site](https://example.com)");

  assert.equal(line?.text, "Hello bold em code site (https://example.com)");
  assert.equal(line?.spans.some((span) => span.text === "bold" && span.bold), true);
  assert.equal(line?.spans.some((span) => span.text === "em" && span.italic), true);
  assert.equal(line?.spans.some((span) => span.text === "code" && span.code), true);
  assert.equal(line?.spans.some((span) => span.href === "https://example.com"), true);
});

test("tui markdown preserves fenced code language", () => {
  const rows = renderMarkdownLines("```ts\nconst ok = true;\n```");

  assert.equal(rows[0]?.kind, "code");
  assert.equal(rows[0]?.language, "ts");
  assert.equal(rows[0]?.text, " ts ");
  assert.equal(rows[1]?.kind, "code");
  assert.equal(rows[1]?.language, "ts");
  assert.equal(rows[1]?.spans.every((span) => span.code), true);
});

test("tui markdown aligns tables by terminal display width", () => {
  const rows = renderMarkdownLines("| 名称 | Value |\n| --- | --- |\n| 猫猫 | 1 |\n| a | 22 |");

  const tableRows = rows.filter((row) => row.kind === "table").map((row) => row.text);

  assert.deepEqual(tableRows, [
    "名称 │ Value",
    "─────┼──────",
    "猫猫 │ 1    ",
    "a    │ 22   ",
  ]);
});

test("tui transcript wraps inline spans with one display width model", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "assistant",
    text: "plain **bold** `code` tail",
  }], 28).filter((row) => row.kind === "content");

  assert.equal(rows.every((row) => row.text.length > 0), true);
  assert.equal(rows.some((row) => row.spans.some((span) => span.bold)), true);
  assert.equal(rows.some((row) => row.spans.some((span) => span.code)), true);
  assert.equal(rows.every((row) => !row.text.includes("**") && !row.text.includes("`")), true);
});
