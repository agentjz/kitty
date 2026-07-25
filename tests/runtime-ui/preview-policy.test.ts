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
  const normalized = truncateVisiblePreview("  alpha\n beta  ");
  assert.equal(normalized.includes("\n"), false);
  assert.equal(normalized, normalized.trim());
  assert.ok(truncateBlock("a".repeat(300), 20).length < 300);
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
  assert.ok(callDisplay.summary.trim());

  const events: VisibleTurnEvent[] = [];
  const callbacks = createVisibleTurnCallbacks({
    onActivity: () => undefined,
    onVisibleEvent: (event) => events.push(event),
  });

  callbacks.onToolResult?.("todo_write", JSON.stringify({
    ok: true,
    preview: "[x] #1: Inspect history\n[>] #2: Restore UI\n- Progress: 1/2 completed",
  }));

  assert.equal(events.length, 1);
  assert.equal(events[0]?.kind, "todo_preview");
  assert.ok(events[0]?.text.trim());
});

test("todo marker styling preserves visible checklist text", () => {
  const input = [
    "[ ] #1: pending task",
    "[>] #2: in progress task",
    "[x] #3: completed task",
    "- Progress: 1/3 completed",
  ].join("\n");

  const rendered = stripAnsi(colorizeTodoMarkers(input));
  assert.equal(rendered.split("\n").length, input.split("\n").length);
});

test("capability tool call display keeps summaries readable", () => {
  const search = buildToolCallDisplay("web_search", JSON.stringify({ query: "current capability architecture" }), 80);
  const download = buildToolCallDisplay("web_download", JSON.stringify({
    url: "https://example.test/file.zip",
    path: "downloads/file.zip",
  }), 80);
  const browser = buildToolCallDisplay("playwright_browser_navigate", JSON.stringify({
    url: "https://example.com/current",
    secretFormValue: "must not be projected",
  }), 80);
  const worktree = buildToolCallDisplay("worktree_create", JSON.stringify({
    path: "C:\\repo-worktree",
    branch: "feature/agent",
  }), 80, "C:\\repo");

  assert.ok([search, download, browser, worktree].every((display) => display.summary.trim()));
  assert.doesNotMatch(browser.summary, /must not be projected/u);
});

function stripAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, "");
}
