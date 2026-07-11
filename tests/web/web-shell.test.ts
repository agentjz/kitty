import assert from "node:assert/strict";
import http from "node:http";
import test from "node:test";
import { once } from "node:events";
import WebSocket, { WebSocketServer } from "ws";

import { createWebInputPort } from "../../src/web/inputPort.js";
import { createWebOutputPort } from "../../src/web/outputPort.js";
import { serveHtml } from "../../src/web/serveHtml.js";
import { createWebTurnDisplay } from "../../src/web/turnDisplay.js";

test("HTTP server returns 200 for root path with correct content type", async () => {
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(serveHtml());
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as import("net").AddressInfo).port;

  try {
    const res = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    assert.ok((await res.text()).length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test("web input port receives WebSocket input messages", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const input = createWebInputPort(wss);
  const port = (wss.address() as import("net").AddressInfo).port;
  const client = new WebSocket(`ws://127.0.0.1:${port}`);

  try {
    await once(client, "open");
    const pending = input.readInput("> ");
    client.send(JSON.stringify({ type: "input", text: "hello from web" }));
    assert.deepEqual(await pending, {
      kind: "submit",
      value: "hello from web",
    });
  } finally {
    client.close();
    await closeWebSocketServer(wss);
  }
});

test("web input port maps WebSocket interrupt messages to the bound handler", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const input = createWebInputPort(wss);
  const port = (wss.address() as import("net").AddressInfo).port;
  const client = new WebSocket(`ws://127.0.0.1:${port}`);
  const interrupted = new Promise<void>((resolve) => {
    input.bindInterrupt(resolve);
  });

  try {
    await once(client, "open");
    client.send(JSON.stringify({ type: "interrupt" }));
    await interrupted;
  } finally {
    client.close();
    await closeWebSocketServer(wss);
  }
});

test("web output port emits user, status, and interrupt events", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const output = createWebOutputPort(wss);
  const port = (wss.address() as import("net").AddressInfo).port;
  const client = new WebSocket(`ws://127.0.0.1:${port}`);

  try {
    await once(client, "open");
    const messages = collectClientMessages(client, 3);
    output.plain("> hello");
    output.info("connected");
    output.interrupt("stopped");

    assert.deepEqual(await messages, [
      { type: "user", text: "> hello" },
      { type: "status", text: "connected" },
      { type: "interrupt", text: "stopped" },
    ]);
  } finally {
    client.close();
    await closeWebSocketServer(wss);
  }
});

test("web turn display emits assistant and tool lifecycle events", async () => {
  const wss = new WebSocketServer({ port: 0 });
  const display = createWebTurnDisplay({
    wss,
    config: { showReasoning: true },
    abortSignal: new AbortController().signal,
  });
  const port = (wss.address() as import("net").AddressInfo).port;
  const client = new WebSocket(`ws://127.0.0.1:${port}`);

  try {
    await once(client, "open");
    const messages = collectClientMessages(client, 5);
    display.callbacks.onModelWaitStart?.();
    display.callbacks.onReasoning?.("thinking");
    display.callbacks.onAssistantDelta?.("hel");
    display.callbacks.onToolCall?.("read", "{}");
    display.callbacks.onAssistantDone?.("hello");

    assert.deepEqual(await messages, [
      { type: "status", text: "🐱 thinking..." },
      { type: "reasoning", text: "thinking" },
      { type: "delta", text: "hel" },
      { type: "status", text: "🔧 read" },
      { type: "done" },
    ]);
  } finally {
    display.dispose();
    client.close();
    await closeWebSocketServer(wss);
  }
});

function collectClientMessages(client: WebSocket, count: number): Promise<Array<Record<string, unknown>>> {
  return new Promise((resolve, reject) => {
    const messages: Array<Record<string, unknown>> = [];
    const onMessage = (raw: WebSocket.RawData) => {
      try {
        messages.push(JSON.parse(raw.toString()) as Record<string, unknown>);
        if (messages.length === count) {
          cleanup();
          resolve(messages);
        }
      } catch (error) {
        cleanup();
        reject(error);
      }
    };
    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };
    const cleanup = () => {
      client.off("message", onMessage);
      client.off("error", onError);
    };
    client.on("message", onMessage);
    client.on("error", onError);
  });
}

async function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  for (const client of wss.clients) {
    client.close();
  }
  await new Promise<void>((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
