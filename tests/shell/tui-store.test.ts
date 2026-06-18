import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscriptEntry,
  appendTranscriptText,
  createInitialTuiState,
  getVisibleTranscriptRows,
  parseSubmittedInputEcho,
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
