import assert from "node:assert/strict";
import test from "node:test";

import { TuiController } from "../../src/shell/tui/controller.js";
import { createTuiExecutionDockWatcher } from "../../src/shell/tui/executionDock.js";
import { createTuiInteractionShell } from "../../src/shell/tui/shell.js";

test("tui shell input queue resolves submitted input", async () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const pending = shell.input.readInput("> ");

  controller.submitInput("hello");

  assert.deepEqual(await pending, { kind: "submit", value: "hello" });
});

test("tui shell keeps submitted input until the session driver is ready to read", async () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);

  controller.submitInput("second message");

  assert.deepEqual(await shell.input.readInput("> "), { kind: "submit", value: "second message" });
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

  display.start?.();
  assert.equal(typeof controller.getState().dock.turnStartedAt, "number");
  display.callbacks.onAssistantDelta?.("hello");
  display.callbacks.onToolCall?.("background_run", JSON.stringify({ command: "npm.cmd run verify" }));
  display.callbacks.onToolResult?.("background_run", JSON.stringify({ status: "running" }));
  display.flush();

  const state = controller.getState();
  assert.equal(state.transcript.map((entry) => entry.text).join(""), "hello");
  assert.ok(state.dock.background);
  assert.match(state.dock.background, /background_run/);
  assert.match(state.dock.background, /running/);
  assert.equal(state.dock.activity, undefined);
  assert.equal(state.dock.turnStartedAt, undefined);
});

test("tui execution watcher clears settled background and subagent lanes", () => {
  const controller = new TuiController();
  let poll: (() => void) | undefined;
  let stopped = false;
  const watcher = createTuiExecutionDockWatcher({
    controller,
    readLiveDock: () => ({ background: undefined, subagent: undefined }),
    schedule: (callback) => {
      poll = callback;
      return () => {
        stopped = true;
      };
    },
  });

  controller.updateDock({
    background: "1 running; watch server",
    subagent: "1 running; inspect files",
  });

  assert.ok(poll);
  poll?.();
  assert.equal(controller.getState().dock.background, undefined);
  assert.equal(controller.getState().dock.subagent, undefined);
  assert.equal(stopped, true);
  watcher.dispose();
});

test("tui turn display renders replayed subagent runtime UI in the current transcript", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onRuntimeUiEvent?.({
    protocol: "kitty.runtime-ui-event",
    channel: "subagent",
    kind: "tool_call",
    toolName: "read",
    payload: JSON.stringify({ path: "src/index.ts" }),
    createdAt: "2026-07-09T00:00:00.000Z",
  });
  display.callbacks.onRuntimeUiEvent?.({
    protocol: "kitty.runtime-ui-event",
    channel: "subagent",
    kind: "assistant_text",
    message: "worker answer",
    createdAt: "2026-07-09T00:00:01.000Z",
  });
  display.callbacks.onRuntimeUiEvent?.({
    protocol: "kitty.runtime-ui-event",
    channel: "lead",
    kind: "status",
    message: "Lead resumed after delegated execution settled.",
    createdAt: "2026-07-09T00:00:02.000Z",
  });

  const state = controller.getState();
  const text = state.transcript.map((entry) => entry.text).join("\n");
  assert.match(text, /\[子代理\]/);
  assert.match(text, /worker answer/);
  assert.equal(state.transcript.some((entry) => entry.role === "subagent" && entry.text === "worker answer"), true);
  assert.equal(state.dock.activity?.summary, "子代理已完成，切回 lead");
});

test("tui turn display does not keep subagent read failures as live subagent state", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onToolError?.("subagent_read", "Unknown execution: subagent-1");
  display.flush();

  assert.equal(controller.getState().dock.subagent, undefined);
  assert.equal(controller.getState().dock.activity, undefined);
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
  assert.equal(controller.getState().dock.activity, undefined);
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

  assert.equal(controller.getState().dock.activity?.summary, "bash npm.cmd run verify");
  assert.equal(controller.getState().dock.activity?.status, "running");
});

test("tui turn display marks subagent replayed tool calls as blocking lead activity", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onRuntimeUiEvent?.({
    protocol: "kitty.runtime-ui-event",
    channel: "subagent",
    kind: "tool_call",
    toolName: "read",
    payload: JSON.stringify({ path: "src/index.ts" }),
    createdAt: "2026-07-09T00:00:00.000Z",
  });

  assert.equal(controller.getState().dock.activity?.channel, "subagent");
  assert.equal(controller.getState().dock.activity?.summary, "read src/index.ts");
  assert.equal(controller.getState().dock.activity?.blockingLead, true);
});

test("tui turn display exposes post-answer summary status", () => {
  const controller = new TuiController();
  const shell = createTuiInteractionShell(controller);
  const display = shell.createTurnDisplay({
    cwd: process.cwd(),
    config: { showReasoning: true } as never,
    abortSignal: new AbortController().signal,
  });

  display.callbacks.onStatus?.("总结中");
  assert.equal(controller.getState().dock.activity?.summary, "总结中");

  display.callbacks.onStatus?.("");
  assert.equal(controller.getState().dock.activity, undefined);
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
  assert.equal(controller.getState().dock.activity, undefined);
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
