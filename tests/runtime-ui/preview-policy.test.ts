import assert from "node:assert/strict";
import test from "node:test";

import {
  createVisibleTurnCallbacks,
  type VisibleTurnEvent,
} from "../../src/runtime-ui/visibleEvents.js";
import { buildToolCallDisplay } from "../../src/runtime-ui/toolDisplay.js";
import { colorizeTodoMarkers } from "../../src/runtime-ui/todoStyling.js";
import {
  normalizeTerminalVerbosity,
  shouldShowToolCallPreview,
  shouldShowToolResultPreview,
  truncateBlock,
  truncateVisiblePreview,
} from "../../src/runtime-ui/previewPolicy.js";

test("runtime-ui preview policy keeps visible text bounded", () => {
  assert.equal(truncateVisiblePreview("  alpha\n beta  "), "alpha beta");
  assert.match(truncateBlock("a".repeat(300), 20), /\[truncated\]/);
  assert.equal(normalizeTerminalVerbosity(undefined), "normal");
  assert.equal(shouldShowToolCallPreview("read", "normal"), false);
  assert.equal(shouldShowToolResultPreview("read", "normal"), false);
  assert.equal(shouldShowToolResultPreview("todo_write", "normal"), true);
});

test("todo_write call display and visible events use checklist preview", () => {
  const callDisplay = buildToolCallDisplay("todo_write", JSON.stringify({
    items: [
      { id: "1", text: "Inspect history", status: "completed" },
      { id: "2", text: "Restore UI", status: "in_progress" },
    ],
  }), 160);
  assert.equal(callDisplay.summary, "todo_write items=2");

  const events: VisibleTurnEvent[] = [];
  const callbacks = createVisibleTurnCallbacks({
    onActivity: () => undefined,
    onVisibleEvent: (event) => events.push(event),
  });

  callbacks.onToolResult?.("todo_write", JSON.stringify({
    ok: true,
    preview: "[x] #1: Inspect history\n[>] #2: Restore UI\n- Progress: 1/2 completed",
  }));

  assert.deepEqual(events, [
    {
      kind: "todo_preview",
      text: "[x] #1: Inspect history\n[>] #2: Restore UI\n- Progress: 1/2 completed",
    },
  ]);
});

test("todo marker styling preserves visible checklist text", () => {
  const input = [
    "[ ] #1: pending task",
    "[>] #2: in progress task",
    "[x] #3: completed task",
    "- Progress: 1/3 completed",
  ].join("\n");

  assert.equal(stripAnsi(colorizeTodoMarkers(input)), input);
});

test("capability tool call display keeps summaries readable", () => {
  assert.equal(
    buildToolCallDisplay("web_search", JSON.stringify({
      query: "current Kitty capability architecture",
    }), 80).summary,
    "web_search current Kitty capability architecture",
  );
  assert.equal(
    buildToolCallDisplay("web_download", JSON.stringify({
      url: "https://example.test/file.zip",
      path: "downloads/file.zip",
    }), 80).summary,
    "web_download downloads/file.zip https://example.test/file.zip",
  );
  assert.equal(
    buildToolCallDisplay("playwright_browser_navigate", JSON.stringify({
      url: "https://example.com/current",
      secretFormValue: "must not be projected",
    }), 80).summary,
    "playwright_browser_navigate https://example.com/current",
  );
  assert.equal(
    buildToolCallDisplay("worktree_create", JSON.stringify({
      path: "C:\\repo-worktree",
      branch: "feature/agent",
    }), 80, "C:\\repo").summary,
    "worktree_create C:\\repo-worktree branch=feature/agent",
  );
});

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
