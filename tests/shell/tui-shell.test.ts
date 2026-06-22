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

test("tui turn display keeps tool calls in runtime dock", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onAssistantDelta?.("hello");
  display.callbacks.onToolCall?.("background_run", "{}");
  display.callbacks.onToolResult?.("background_run", "done");
  display.flush();

  const state = controller.getState();
  assert.equal(state.transcript.map((entry) => entry.text).join(""), "hello");
  assert.match(state.dock.background, /background_run/);
  assert.doesNotMatch(state.transcript.map((entry) => entry.text).join("\n"), /done/);
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
