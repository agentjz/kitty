import assert from "node:assert/strict";
import test from "node:test";

import {
  projectTuiToolCallFact,
  projectTuiToolCallProgressFact,
  projectTuiToolResultFact,
} from "../../src/shell/tui/toolFacts.js";
import { createTuiTurnDisplay } from "../../src/shell/tui/turnDisplay.js";
import type { TuiController } from "../../src/shell/tui/controller.js";
import type { TuiRuntimeDockState, TuiTranscriptRole } from "../../src/shell/tui/store.js";

test("tui tool activity projects stable targets without exposing content arguments", () => {
  const cases = [
    ["bash", JSON.stringify({ command: "Get-ChildItem C:/secret/path" })],
    ["read", JSON.stringify({ path: "C:/secret/file.ts", offset: 80 })],
    ["edit", JSON.stringify({ path: "C:/secret/file.ts", oldText: "before", newText: "after" })],
  ] as const;
  for (const [name, args] of cases) {
    const fact = projectTuiToolCallFact(name, args, { now: 1 });
    const expected = name === "bash" ? name : `${name} C:/secret/file.ts`;
    assert.equal(fact.activity.summary, expected);
    assert.equal(fact.activity.detail, undefined);
    assert.doesNotMatch(fact.activity.summary, /Get-ChildItem|before|after/);
  }
});

test("tui projects completed write and edit diffs from tool result facts", () => {
  const fact = projectTuiToolResultFact("edit", JSON.stringify({
    path: "src/example.ts",
    diff: "  const before = true;\n- const oldValue = 1;\n+ const newValue = 2;",
  }), "en");

  assert.equal(fact.transcript?.role, "change");
  assert.match(fact.transcript?.text ?? "", /^● Updated src\/example\.ts/m);
  assert.match(fact.transcript?.text ?? "", /^  \+1 -1/m);
  assert.match(fact.transcript?.text ?? "", /^  - const oldValue/m);
  assert.match(fact.transcript?.text ?? "", /^  \+ const newValue/m);

  const read = projectTuiToolResultFact("read", JSON.stringify({
    path: "src/example.ts",
    startLine: 10,
    endLine: 12,
    content: "10 | first\n11 | second\n12 | third",
  }), "en");
  assert.equal(read.transcript?.role, "tool");
  assert.equal(read.transcript?.text, "● Read src/example.ts · 10-12 · Ctrl+O to expand");
  assert.match(read.transcript?.details ?? "", /11 \| second/);
});

test("tui projects real write and edit argument progress without exposing arguments", () => {
  const write = projectTuiToolCallProgressFact({
    index: 0,
    id: "call-write",
    name: "write",
    argumentBytesReceived: 12_345,
  }, { now: 1 });
  assert.equal(write?.activity.summary, "write");
  assert.equal(write?.activity.detail, "12 kB");

  const edit = projectTuiToolCallProgressFact({
    index: 1,
    id: "call-edit",
    name: "edit",
    argumentBytesReceived: 999,
  }, { now: 1 });
  assert.equal(edit?.activity.detail, "999 B");

  assert.equal(projectTuiToolCallProgressFact({
    index: 2,
    id: "call-bash",
    name: "bash",
    argumentBytesReceived: 50_000,
  }), undefined);
});

test("tui turn display connects provider progress and completed diff facts", () => {
  const docks: Array<Partial<TuiRuntimeDockState>> = [];
  const transcript: Array<{ role: TuiTranscriptRole; text: string; details?: string }> = [];
  const controller = {
    updateDock(patch: Partial<TuiRuntimeDockState>) {
      docks.push(patch);
    },
    append(role: TuiTranscriptRole, text: string, options: { details?: string } = {}) {
      transcript.push({ role, text, details: options.details });
    },
  } as unknown as TuiController;
  const display = createTuiTurnDisplay({
    controller,
    config: { locale: "en", showReasoning: true },
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onToolCallProgress?.({
    index: 0,
    id: "call-write",
    name: "write",
    argumentBytesReceived: 1_234,
  });
  display.callbacks.onToolResult?.("write", JSON.stringify({
    path: "src/example.ts",
    diff: "- old\n+ new",
  }));

  assert.equal(docks[0]?.activity?.summary, "write");
  assert.equal(docks[0]?.activity?.detail, "1.2 kB");
  assert.deepEqual(transcript, [{
    role: "change",
    text: "● Updated src/example.ts\n  +1 -1\n  - old\n  + new",
    details: undefined,
  }]);
});

test("tui projects typed plan items without parsing preview text", () => {
  const fact = projectTuiToolResultFact("todo_write", JSON.stringify({
    preview: "this string is not the plan contract",
    items: [
      { id: "1", text: "inspect facts", status: "completed" },
      { id: "2", text: "implement projection", status: "in_progress" },
      { id: "3", text: "verify behavior", status: "pending" },
    ],
  }), "en");

  assert.equal(fact.transcript?.role, "plan");
  assert.equal(fact.transcript?.text, "● Updated Plan · 1/3");
  assert.deepEqual(fact.transcript?.planItems?.map((item) => item.status), [
    "completed",
    "in_progress",
    "pending",
  ]);
});
