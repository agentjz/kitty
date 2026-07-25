import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";
import { WebSocket, type WebSocketServer } from "ws";

import { buildWebMessages } from "../../src/web/messages.js";
import { WebChatShell } from "../../src/web/chatShell.js";
import { createMessage } from "../../src/session/messages.js";
import { InProcessSessionStore } from "../../src/session/store.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { createTuiInteractionShell } from "../../src/shell/tui/shell.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import type { SessionRecord } from "../../src/types.js";

test("web replay preserves visible messages and tool event order", () => {
  const shell = new WebChatShell(buildWebMessages("zh-CN").shell);
  const toolCall = {
    id: "call-1",
    type: "function" as const,
    function: { name: "read", arguments: JSON.stringify({ path: "README.md" }) },
  };
  const session: SessionRecord = {
    id: "web-replay-session",
    revision: 1,
    createdAt: "2026-07-18T00:00:00.000Z",
    updatedAt: "2026-07-18T00:00:01.000Z",
    cwd: ".",
    messageCount: 4,
    messages: [
      createMessage("user", "检查 README"),
      createMessage("assistant", null, { toolCalls: [toolCall] }),
      {
        ...createMessage("tool", "read output", { name: "read" }),
        tool_call_id: "call-1",
        toolResult: {
          callId: "call-1",
          toolName: "read",
          status: "success",
          summary: "已读取 README.md",
          modelView: "{\"path\":\"README.md\"}",
          compactView: "read: success",
          facts: {},
          artifacts: [],
          truncation: { truncated: false, strategy: "none", projectedChars: 24 },
        },
      },
      createMessage("assistant", "README 已检查"),
    ],
  };

  const events: Array<{ type?: string; summary?: string }> = [];
  shell.replaySession(session, (event) => events.push(event as { type?: string; summary?: string }));

  assert.deepEqual(events.map((event) => event.type), ["user", "tool_call", "tool_result", "message"]);
  assert.ok(events[2]?.summary?.trim());
});

test("web live tool failures preserve their actionable error fact", () => {
  const shell = new WebChatShell(buildWebMessages("zh-CN").shell);
  const events: Array<{ type?: string; summary?: string }> = [];
  (shell as unknown as { broadcast: (event: { type?: string; summary?: string }) => void }).broadcast = (event) => events.push(event);
  const display = shell.createTurnDisplay({
    cwd: ".",
    config: createTestRuntimeConfig("."),
    abortSignal: new AbortController().signal,
  });
  display.callbacks.onToolCall?.("generate_image", "{}");
  display.callbacks.onToolError?.("generate_image", JSON.stringify({
    ok: false,
    error: "Media provider is temporarily unavailable (HTTP 503, request req_test).",
  }));
  assert.equal(events.at(-1)?.type, "tool_error");
  assert.match(events.at(-1)?.summary ?? "", /HTTP 503.*req_test/u);
});

test("web shell shutdown drains accepted replay and control tasks", async () => {
  const shell = new WebChatShell(buildWebMessages("zh-CN").shell);
  const server = new EventEmitter() as WebSocketServer;
  const socket = new EventEmitter() as EventEmitter & {
    readyState: number;
    sent: string[];
    send(value: string): void;
    close(): void;
    terminate(): void;
  };
  socket.readyState = WebSocket.OPEN;
  socket.sent = [];
  socket.send = (value) => { socket.sent.push(value); };
  socket.close = () => { socket.readyState = WebSocket.CLOSING; };
  socket.terminate = () => { socket.readyState = WebSocket.CLOSED; socket.emit("close"); };
  let releaseReplay!: () => void;
  const replayGate = new Promise<void>((resolve) => { releaseReplay = resolve; });
  let releaseControl!: () => void;
  const controlGate = new Promise<void>((resolve) => { releaseControl = resolve; });
  shell.attach(server, async () => replayGate, async () => controlGate);
  server.emit("connection", socket);
  socket.emit("message", Buffer.from(JSON.stringify({ type: "session_select", sessionId: "session-2" })));
  shell.stopAdmission();
  let drained = false;
  const drain = shell.waitForIdle().then(() => { drained = true; });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(drained, false);
  releaseReplay();
  releaseControl();
  await drain;
  assert.equal(drained, true);
  shell.dispose();
});

test("interactive driver can switch the bound session without creating a second host", async (t) => {
  const root = await createTempWorkspace("web-session-switch", t);
  const config = createTestRuntimeConfig(root);
  const store = new InProcessSessionStore();
  const first = await store.save(await store.create(root));
  const second = await store.save(await store.create(root));
  const controller = new TuiController(first);
  let changedId = "";
  const driver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session: first,
    sessionStore: store,
    shell: createTuiInteractionShell(controller),
    surface: "web",
    ownsProcessSignals: false,
    onSessionChanged: (session) => { changedId = session.id; },
  });

  const signalCounts = ["SIGHUP", "SIGTERM", "SIGBREAK"].map((signal) => process.listenerCount(signal));
  const running = driver.run();
  assert.deepEqual(["SIGHUP", "SIGTERM", "SIGBREAK"].map((signal) => process.listenerCount(signal)), signalCounts);
  assert.equal(await driver.selectSession(second), true);
  assert.equal(changedId, second.id);
  controller.closeInput();
  await running;
});
