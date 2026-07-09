import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscriptEntry,
  appendTranscriptText,
  createInitialTuiState,
  getVisibleTranscriptRows,
  measureTranscriptRows,
  parseSubmittedInputEcho,
  projectRuntimeStatusToDock,
  renderTranscriptLineViews,
  formatContextBudget,
  scrollTuiTranscript,
  scrollTuiTranscriptToBottom,
  type TuiViewport,
} from "../../src/shell/tui/store.js";
import type { RuntimeStatus } from "../../src/runtime/status.js";
import { TuiTranscriptProjection } from "../../src/shell/tui/transcriptProjection.js";
import type { SessionRecord } from "../../src/types.js";
import type { TuiTranscriptEntry } from "../../src/shell/tui/store.js";

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
  assert.equal(createInitialTuiState().dock.context, "0%");
  assert.equal(formatContextBudget(undefined), "0%");
});

test("tui dock projects background and subagent facts from runtime status", () => {
  const dock = projectRuntimeStatusToDock({
    sessions: {
      latest: {
        contextBudget: {
          estimatedChars: 250,
          limitChars: 1000,
          usageRatio: 0.25,
        },
      },
    },
    scene: {
      executions: [
        { id: "bg", kind: "background", status: "running", risk: "watch", summary: "watch server" },
        { id: "sub", kind: "subagent", status: "running", risk: "none", summary: "inspect files" },
      ],
    },
  } as RuntimeStatus);

  assert.match(dock.background ?? "", /1 running/);
  assert.match(dock.background ?? "", /attention/);
  assert.match(dock.subagent ?? "", /inspect files/);
  assert.equal(dock.context, "250/1000 chars (25%)");
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

test("tui transcript keeps submitted user messages compact without full-width panel fill", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "user",
    text: "hello",
  }], 80);

  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.kind, "spacer");
  assert.equal(rows[1]?.text, "hello");
  assert.equal(rows[1]?.style.background, undefined);
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
  assert.equal(rows.some((row) => row.markdownKind === "code" && row.language === "ts" && row.text === " ts "), true);
  assert.equal(rows.some((row) => row.markdownKind === "quote" && row.text === "│ note"), true);
  assert.equal(rows.some((row) => row.text.includes("```")), false);
});

test("tui transcript projection caches stable entry layout by id text and width", () => {
  const entries = [{
    id: "entry-1",
    role: "assistant" as const,
    text: "## Title\n\nA long answer that wraps.",
  }, {
    id: "entry-2",
    role: "assistant" as const,
    text: "Stable second answer.",
  }];
  const layouts: string[] = [];
  const projection = new TuiTranscriptProjection({
    onEntryLayout(entry, width) {
      layouts.push(`${entry.id}:${width}:${entry.text.length}`);
    },
  });

  const first = projection.renderLineViews(entries, 40);
  const second = projection.renderLineViews(entries, 40);

  assert.notEqual(first, second);
  assert.equal(first[0], second[0]);
  assert.equal(first.at(-1), second.at(-1));
  assert.deepEqual(layouts, ["entry-1:40:35", "entry-2:40:21"]);

  projection.renderLineViews([{ ...entries[0]!, text: `${entries[0]!.text}!` }, entries[1]!], 40);
  assert.deepEqual(layouts, ["entry-1:40:35", "entry-2:40:21", "entry-1:40:36"]);

  projection.renderLineViews(entries, 30);
  assert.deepEqual(layouts, [
    "entry-1:40:35",
    "entry-2:40:21",
    "entry-1:40:36",
    "entry-1:30:35",
    "entry-2:30:21",
  ]);
});

test("tui transcript projection returns only requested visible rows", () => {
  const projection = new TuiTranscriptProjection();
  const rows = projection.renderVisibleLineViews([{
    id: "entry-1",
    role: "assistant",
    text: "one\ntwo\nthree\nfour\nfive",
  }], { width: 80, height: 2 }, 2);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((row) => row.text), ["two", "three"]);
});

test("tui transcript projection keeps long session layout cached across scroll and resize", () => {
  const entries: TuiTranscriptEntry[] = Array.from({ length: 1_000 }, (_, index) => ({
    id: `entry-${index}`,
    role: index % 3 === 0 ? "assistant" : index % 3 === 1 ? "reasoning" : "user",
    text: [
      `## Item ${index}`,
      "",
      `This is a long row with **bold ${index}** and \`code ${index}\` that should wrap under the same model.`,
      "",
      "| 名称 | Value |",
      "| --- | --- |",
      `| 猫猫${index} | ${index} |`,
    ].join("\n"),
  }));
  const layouts: string[] = [];
  const projection = new TuiTranscriptProjection({
    onEntryLayout(entry, width) {
      layouts.push(`${entry.id}:${width}`);
    },
  });

  const firstVisible = projection.renderVisibleLineViews(entries, { width: 96, height: 12 }, 0);
  const laterVisible = projection.renderVisibleLineViews(entries, { width: 96, height: 12 }, 400);
  const measured = projection.measureRows(entries, 96);
  const repeatVisible = projection.renderVisibleLineViews(entries, { width: 96, height: 12 }, 800);

  assert.equal(firstVisible.length, 12);
  assert.equal(laterVisible.length, 12);
  assert.equal(repeatVisible.length, 12);
  assert.ok(measured > entries.length);
  assert.equal(layouts.length, entries.length);

  projection.renderVisibleLineViews(entries, { width: 72, height: 12 }, 0);
  assert.equal(layouts.length, entries.length + 3);
  assert.deepEqual(layouts.slice(-3), ["entry-0:72", "entry-1:72", "entry-2:72"]);
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
