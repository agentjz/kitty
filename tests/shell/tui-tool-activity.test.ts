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
    assert.ok(fact.activity.summary.trim());
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
  assert.ok(fact.transcript?.text.trim());

  const read = projectTuiToolResultFact("read", JSON.stringify({
    path: "src/example.ts",
    startLine: 10,
    endLine: 12,
    content: "10 | first\n11 | second\n12 | third",
  }), "en");
  assert.equal(read.transcript?.role, "tool");
  assert.ok(read.transcript?.text.trim());

  const bash = projectTuiToolResultFact("bash", JSON.stringify({
    command: "npm test",
    status: "completed",
    output: "all tests passed",
  }), "en");
  assert.equal(bash.transcript?.role, "tool");
  assert.ok(bash.transcript?.text.trim());
});

test("tui projects real write and edit argument progress without exposing arguments", () => {
  const write = projectTuiToolCallProgressFact({
    index: 0,
    id: "call-write",
    name: "write",
    argumentBytesReceived: 12_345,
  }, { now: 1 });
  assert.ok(write?.activity.summary.trim());
  assert.match(write?.activity.detail ?? "", /\d/u);

  const edit = projectTuiToolCallProgressFact({
    index: 1,
    id: "call-edit",
    name: "edit",
    argumentBytesReceived: 999,
  }, { now: 1 });
  assert.match(edit?.activity.detail ?? "", /\d/u);

  assert.equal(projectTuiToolCallProgressFact({
    index: 2,
    id: "call-bash",
    name: "bash",
    argumentBytesReceived: 50_000,
  }), undefined);
});

test("tui turn display connects provider progress and completed diff facts", () => {
  const docks: Array<Partial<TuiRuntimeDockState>> = [];
  const transcript: Array<{ role: TuiTranscriptRole; text: string }> = [];
  const controller = {
    updateDock(patch: Partial<TuiRuntimeDockState>) {
      docks.push(patch);
    },
    append(role: TuiTranscriptRole, text: string) {
      transcript.push({ role, text });
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

  assert.ok(docks[0]?.activity?.summary.trim());
  assert.match(docks[0]?.activity?.detail ?? "", /\d/u);
  assert.equal(transcript.length, 1);
  assert.equal(transcript[0]?.role, "change");
  assert.ok(transcript[0]?.text.trim());
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
  assert.ok(fact.transcript?.text.trim());
  assert.deepEqual(fact.transcript?.planItems?.map((item) => item.status), [
    "completed",
    "in_progress",
    "pending",
  ]);
});
