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

  assert.equal(tableRows[0]?.startsWith("┌"), true);
  assert.equal(tableRows[1], "│ 名称 │ Value │");
  assert.equal(tableRows.some((row) => row === "│ 猫猫 │ 1     │"), true);
  assert.equal(tableRows.at(-1)?.startsWith("└"), true);
});

test("tui markdown degrades wide tables to readable records at narrow widths", () => {
  const rows = renderMarkdownLines(
    "| File | Result |\n| --- | --- |\n| src/a-very-long-file-name.ts | completed successfully |",
    { width: 24 },
  );

  assert.deepEqual(rows.map((row) => row.text), [
    "File: src/a-very-long-file-name.ts",
    "Result: completed successfully",
  ]);
  assert.equal(rows.every((row) => row.kind === "table"), true);
});

test("tui markdown preserves nested and task list structure", () => {
  const rows = renderMarkdownLines("- parent\n  - [x] finished\n  - [ ] pending");
  const listRows = rows.filter((row) => row.kind === "list").map((row) => row.text);

  assert.equal(listRows[0], "• parent");
  assert.equal(listRows.some((row) => row.includes("• [x] finished")), true);
  assert.equal(listRows.some((row) => row.includes("• [ ] pending")), true);
  assert.equal(listRows[1]?.startsWith("  "), true);
});

test("tui markdown expands a markdown fence only when it contains a parsed table", () => {
  const table = renderMarkdownLines("```markdown\n| A | B |\n| --- | --- |\n| 1 | 2 |\n```");
  const prose = renderMarkdownLines("```markdown\n**literal markdown example**\n```");

  assert.equal(table.some((row) => row.kind === "table"), true);
  assert.equal(table.some((row) => row.kind === "code"), false);
  assert.equal(prose.every((row) => row.kind === "code"), true);
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
