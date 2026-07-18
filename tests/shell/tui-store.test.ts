import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscriptEntry,
  appendTranscriptText,
  createInitialTuiState,
  getVisibleTranscriptRows,
  hasTuiConversation,
  measureTranscriptRows,
  projectRuntimeStatusToDock,
  renderTranscriptLineViews,
  formatContextBudget,
  scrollTuiTranscript,
  scrollTuiTranscriptToBottom,
  type TuiViewport,
} from "../../src/shell/tui/store.js";
import { parseSubmittedInputEcho } from "../../src/interaction/submittedInput.js";
import { projectTuiExecutionDockFacts, readTuiLiveExecutionDock } from "../../src/shell/tui/executionDock.js";
import { ExecutionStore } from "../../src/execution/store.js";
import type { RuntimeStatus } from "../../src/runtime/status.js";
import { TuiTranscriptProjection } from "../../src/shell/tui/transcriptProjection.js";
import type { SessionRecord } from "../../src/types.js";
import type { TuiTranscriptEntry } from "../../src/shell/tui/store.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

const viewport: TuiViewport = {
  width: 20,
  height: 3,
};

test("tui leaves the welcome layout after the first visible transcript entry", () => {
  const empty = createInitialTuiState();
  const systemOnly = appendTranscriptEntry(empty, { role: "system", text: "recovery notice" }, viewport);
  const conversation = appendTranscriptEntry(systemOnly, { role: "user", text: "hello" }, viewport);

  assert.equal(hasTuiConversation(empty), false);
  assert.equal(hasTuiConversation(systemOnly), true);
  assert.equal(hasTuiConversation(conversation), true);
});

test("tui state projects external session messages without internal facts", () => {
  const state = createInitialTuiState(createSession([
    { role: "user", content: "hello" },
    { role: "assistant", content: "hi" },
    { role: "user", content: "wake", source: "internal" },
  ]));

  assert.deepEqual(state.transcript.map((entry) => entry.text), ["hello", "hi"]);
});

test("tui live transcript entry IDs remain unique when internal session messages were omitted", () => {
  let state = createInitialTuiState(createSession([
    { role: "user", content: "internal wake", source: "internal" },
    { role: "assistant", content: "visible answer" },
  ]));
  state = appendTranscriptEntry(state, { role: "user", text: "next input" }, viewport);

  assert.equal(new Set(state.transcript.map((entry) => entry.id)).size, state.transcript.length);
});

test("tui context budget defaults to zero before runtime facts arrive", () => {
  assert.equal(createInitialTuiState().dock.context, "0%");
  assert.equal(formatContextBudget(undefined), "0%");
});

test("tui execution dock only keeps active control-plane lanes", () => {
  const dock = projectTuiExecutionDockFacts([
    { status: "running", risk: "watch" },
    { status: "completed" },
  ]);

  assert.notEqual(dock.background, undefined);
});

test("tui transcript sticks to bottom unless user scrolls history", () => {
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "assistant", text: "one\ntwo\nthree\nfour" }, viewport);

  assert.equal(state.scroll.mode, "follow");
  const bottomOffset = state.scroll.offset;

  state = scrollTuiTranscript(state, viewport, -2);
  assert.equal(state.scroll.mode, "detached");

  state = appendTranscriptEntry(state, { role: "assistant", text: "five" }, viewport);
  assert.equal(state.scroll.unseenRows > 0, true);
  assert.equal(state.scroll.offset < bottomOffset + 2, true);

  state = scrollTuiTranscriptToBottom(state, viewport);
  assert.equal(state.scroll.unseenRows, 0);
  assert.equal(state.scroll.mode, "follow");
});

test("tui streaming preserves the detached top row while new rows arrive", () => {
  const projection = new TuiTranscriptProjection();
  const narrow: TuiViewport = { width: 32, height: 4 };
  let state = createInitialTuiState();
  state = appendTranscriptEntry(state, { role: "assistant", text: "one\ntwo\nthree\nfour\nfive\nsix" }, narrow, { projection });
  state = scrollTuiTranscript(state, narrow, -3, { projection });
  const before = projection.renderLineViews(state.transcript, narrow.width)[state.scroll.offset]?.id;

  state = appendTranscriptText(state, "assistant", "\nseven\neight\nnine", narrow, { projection });
  const after = projection.renderLineViews(state.transcript, narrow.width)[state.scroll.offset]?.id;

  assert.equal(state.scroll.mode, "detached");
  assert.equal(after, before);
  assert.equal(state.scroll.unseenRows > 0, true);
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
  assert.equal(rows.some((row) => row.prefix === "思考: "), true);
});

test("tui transcript layout uses terminal display width for wide characters", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "reasoning",
    text: "你好你好你好你好你好",
  }], 24);

  assert.equal(rows.some((row) => row.prefix === "思考: "), true);
  assert.equal(rows.every((row) => row.kind === "spacer" || !row.text.includes("你好你好你好你好你好")), true);
});

test("tui Thinking remains readable without italic or dim styling", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "reasoning",
    text: "inspect the evidence",
  }], 80).filter((row) => row.kind === "content");

  assert.equal(rows.length > 0, true);
  assert.equal(rows.every((row) => row.style.dim === false), true);
  assert.equal(rows.every((row) => row.style.italicPrefix === false), true);
  assert.equal(rows[0]?.prefix, "思考: ");
});

test("tui transcript gives submitted user messages a padded focus surface", () => {
  const rows = renderTranscriptLineViews([{
    id: "entry-1",
    role: "user",
    text: "hello",
  }], 80);

  assert.equal(rows.length, 4);
  assert.equal(rows[0]?.kind, "spacer");
  assert.equal(rows[1]?.text, "");
  assert.equal(rows[2]?.text, "hello");
  assert.equal(rows[3]?.text, "");
  assert.equal(typeof rows[1]?.style.background, "string");
  assert.equal(typeof rows[3]?.style.background, "string");
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

test("tui transcript renders completed change facts with distinct diff rows", () => {
  const rows = renderTranscriptLineViews([{
    id: "change-1",
    role: "change",
    text: "edit src/example.ts\n  unchanged\n- removed\n+ added",
  }], 80).filter((row) => row.kind === "content");

  assert.equal(rows[0]?.markdownKind, "changeHeader");
  assert.equal(rows[0]?.style.bold, true);
  assert.equal(rows[2]?.markdownKind, "diffRemoved");
  assert.equal(typeof rows[2]?.style.background, "string");
  assert.equal(rows[3]?.markdownKind, "diffAdded");
  assert.equal(typeof rows[3]?.style.background, "string");
  assert.notEqual(rows[2]?.style.background, rows[3]?.style.background);
});

test("tui transcript renders typed plan hierarchy and completed strike state", () => {
  const state = appendTranscriptEntry(createInitialTuiState(undefined, "en"), {
    role: "plan",
    text: "Updated Plan · 1/3",
    planItems: [
      { id: "1", text: "inspect facts", status: "completed" },
      { id: "2", text: "implement projection", status: "in_progress" },
      { id: "3", text: "verify behavior", status: "pending" },
    ],
  }, { width: 80, height: 24 });
  const rows = renderTranscriptLineViews(state.transcript, 80);

  assert.equal(rows.some((row) => row.markdownKind === "planHeader" && row.text.includes("Updated Plan")), true);
  const completed = rows.find((row) => row.markdownKind === "planCompleted");
  assert.equal(completed?.text.includes("✓ #1 inspect facts"), true);
  assert.equal(completed?.spans.some((span) => span.text === "inspect facts" && span.strike), true);
  assert.equal(rows.some((row) => row.markdownKind === "planActive" && row.text.includes("● #2")), true);
  assert.equal(rows.some((row) => row.markdownKind === "planPending" && row.text.includes("□ #3")), true);
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

  const beforeResize = layouts.length;
  projection.renderVisibleLineViews(entries, { width: 72, height: 12 }, 0);
  const resizedLayouts = layouts.slice(beforeResize);
  assert.equal(resizedLayouts.length > 0 && resizedLayouts.length < 10, true);
  assert.deepEqual(
    resizedLayouts,
    resizedLayouts.map((_, index) => `entry-${index}:72`),
  );
});

test("tui parses submitted input echo from session driver", () => {
  assert.equal(parseSubmittedInputEcho("> hello\n… world"), "hello\nworld");
  assert.equal(parseSubmittedInputEcho("plain output"), undefined);
});

function createSession(messages: Array<{ role: "user" | "assistant"; content: string; source?: "external" | "internal" }>): SessionRecord {
  return {
    id: "session-1",
    revision: 0,
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
