import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscriptEntry,
  appendTranscriptText,
  createInitialTuiState,
  getVisibleTranscriptRows,
  measureTranscriptRows,
  parseSubmittedInputEcho,
  renderTranscriptLineViews,
  formatContextBudget,
  scrollTuiTranscript,
  scrollTuiTranscriptToBottom,
  type TuiViewport,
} from "../../src/shell/tui/store.js";
import type { SessionRecord } from "../../src/types.js";

const viewport: TuiViewport = {
  width: 20,
  height: 3,
};

test("tui state projects external session messages without internal facts", () => {
  const state = createInitialTuiState(createSession([
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "wake", source: "internal" },
  ]));

  assert.deepEqual(state.transcript.map((entry) => entry.text), ["hello", "hi"]);
});

test("tui context budget defaults to zero before runtime facts arrive", () => {
  assert.equal(createInitialTuiState().dock.context, "0 chars (0%)");
  assert.equal(formatContextBudget(undefined), "0 chars (0%)");
});

test("tui transcript sticks to bottom unless user scrolls history", () => {
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "assistant", text: "one\ntwo\nthree\nfour" }, viewport);

  assert.equal(state.scroll.stickToBottom, true);
  const bottomOffset = state.scroll.offset;

  state = scrollTuiTranscript(state, viewport, -2);
  assert.equal(state.scroll.stickToBottom, false);

  state = appendTranscriptEntry(state, { role: "assistant", text: "five" }, viewport);
  assert.equal(state.scroll.newContentPending, true);
  assert.equal(state.scroll.offset < bottomOffset + 2, true);

  state = scrollTuiTranscriptToBottom(state, viewport);
  assert.equal(state.scroll.newContentPending, false);
  assert.equal(state.scroll.stickToBottom, true);
});

test("tui streaming appends assistant text into one visible entry", () => {
  let state = createInitialTuiState();
  state = appendTranscriptText(state, "assistant", "hel", viewport);
  state = appendTranscriptText(state, "assistant", "lo", viewport);

  assert.equal(state.transcript.length, 1);
  assert.equal(state.transcript[0]?.text, "hello");
  assert.deepEqual(getVisibleTranscriptRows(state, viewport).some((row) => row.includes("hello")), true);
});

test("tui transcript layout owns wrapping and bottom scroll for long assistant output", () => {
  const narrow: TuiViewport = { width: 34, height: 5 };
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, {
    role: "assistant",
    text: "This is a long assistant answer that should wrap into several managed transcript rows without relying on Ink to invent extra rows.",
  }, narrow);
  state = appendTranscriptEntry(state, {
    role: "reasoning",
    text: "This is a long thinking trace that also needs the Thinking prefix to be counted by the same layout model.",
  }, narrow);

  const rows = renderTranscriptLineViews(state.transcript, narrow.width);
  assert.equal(measureTranscriptRows(state.transcript, narrow.width), rows.length);
  assert.equal(state.scroll.offset, Math.max(0, rows.length - narrow.height));
  assert.deepEqual(
    getVisibleTranscriptRows(state, narrow),
    rows.slice(state.scroll.offset, state.scroll.offset + narrow.height).map((row) => row.text),
  );
  assert.equal(rows.some((row) => row.prefix === "Thinking: "), true);
});

test("tui transcript layout uses terminal display width for wide characters", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "reasoning",
    text: "你好你好你好你好你好",
  }], 24);

  assert.equal(rows.some((row) => row.prefix === "Thinking: "), true);
  assert.equal(rows.every((row) => row.kind === "spacer" || !row.text.includes("你好你好你好你好你好")), true);
});

test("tui transcript keeps markdown structure as display facts", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "assistant",
    text: "## Title\n\n- first\n\n```ts\nconst ok = true;\n```\n\n> note",
  }], 80).filter((row) => row.kind === "content");

  assert.equal(rows.some((row) => row.markdownKind === "heading" && row.text === "Title"), true);
  assert.equal(rows.some((row) => row.markdownKind === "list" && row.text === "• first"), true);
  assert.equal(rows.some((row) => row.markdownKind === "code" && row.text === "const ok = true;"), true);
  assert.equal(rows.some((row) => row.markdownKind === "quote" && row.text === "│ note"), true);
  assert.equal(rows.some((row) => row.text.includes("```")), false);
});

test("tui parses submitted input echo from session driver", () => {
  assert.equal(parseSubmittedInputEcho("> hello\n… world"), "hello\nworld");
  assert.equal(parseSubmittedInputEcho("plain output"), undefined);
});

function createSession(messages: Array<{ role: "user" | "assistant"; content: string; source?: "external" | "internal" }>): SessionRecord {
  return {
    id: "session-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    cwd: process.cwd(),
    messageCount: messages.length,
    messages: messages.map((message) => ({
      ...message,
      createdAt: "2026-01-01T00:00:00.000Z",
    })),
  };
}
