import assert from "node:assert/strict";
import test from "node:test";

import { TuiController } from "../../src/shell/tui/controller.js";
import { createTuiInteractionShell } from "../../src/shell/tui/shell.js";

test("tui shell input queue resolves submitted input", async () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const pending = shell.input.readInput("> ");

  controller.submitInput("hello");

  assert.deepEqual(await pending, { kind: "submit", value: "hello" });
});

test("tui shell output projects submitted input as user transcript", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);

  shell.output.plain("> hello");

  assert.equal(controller.getState().transcript[0]?.role, "user");
  assert.equal(controller.getState().transcript[0]?.text, "hello");
});

test("tui turn display keeps live tool facts in runtime dock", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onAssistantDelta?.("hello");
  display.callbacks.onToolCall?.("background_run", JSON.stringify({ command: "npm.cmd run verify" }));
  display.callbacks.onToolResult?.("background_run", JSON.stringify({ status: "running" }));
  display.flush();

  const state = controller.getState();
  assert.equal(state.transcript.map((entry) => entry.text).join(""), "hello");
  assert.ok(state.dock.background);
  assert.match(state.dock.background, /background_run/);
  assert.match(state.dock.background, /running/);
  assert.equal(state.dock.current, undefined);
});

test("tui turn display shows todo_write preview as a tool transcript fact", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onToolCall?.("todo_write", JSON.stringify({
    items: [{ id: "1", text: "接入 TUI todo", status: "in_progress" }],
  }));
  display.callbacks.onToolResult?.("todo_write", JSON.stringify({
    ok: true,
    preview: "[>] #1: 接入 TUI todo\n- Progress: 0/1 completed",
  }));

  const text = controller.getState().transcript.map((entry) => entry.text).join("\n");
  assert.match(text, /\[>\] #1: 接入 TUI todo/);
  assert.equal(controller.getState().dock.current, undefined);
});

test("tui turn display keeps raw bash command visible while running", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onToolCall?.("bash", JSON.stringify({ command: "npm.cmd run verify" }));

  assert.equal(controller.getState().dock.current, "bash npm.cmd run verify");
});

test("tui turn display does not let unrelated tools clear live execution facts", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onToolCall?.("background_run", JSON.stringify({ command: "node server.js" }));
  display.callbacks.onToolResult?.("background_run", JSON.stringify({ status: "running" }));
  display.callbacks.onToolCall?.("read", JSON.stringify({ path: "package.json" }));
  display.callbacks.onToolResult?.("read", JSON.stringify({ ok: true, content: "{}" }));

  assert.match(controller.getState().dock.background ?? "", /running/);
  assert.equal(controller.getState().dock.current, undefined);
});

test("tui shell interrupt forwards to session driver handler", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  let interrupted = false;

  shell.input.bindInterrupt(() => {
    interrupted = true;
  });
  controller.interrupt();

  assert.equal(interrupted, true);
});

test("tui controller projects every streaming delta through the same path", () => {
  const controller = new TuiController();
  let updates = 0;
  const unsubscribe = controller.subscribe(() => {
    updates += 1;
  });

  controller.appendStreaming("assistant", "hel");
  controller.appendStreaming("assistant", "lo");

  assert.equal(controller.getState().transcript.length, 1);
  unsubscribe();
  assert.equal(controller.getState().transcript[0]?.text, "hello");
  assert.equal(updates, 3);
});
