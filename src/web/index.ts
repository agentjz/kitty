import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import process from "node:process";

import { WebSocketServer } from "ws";

import { InteractiveSessionDriver, type InteractiveSessionDriverOptions } from "../interaction/sessionDriver.js";

import { isSessionNotFoundError } from "../session/errors.js";
import type { SessionStoreLike } from "../session/index.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { createWebInteractionShell } from "./shell.js";
import { serveHtml } from "./serveHtml.js";
import { writeStdoutLine, writeStdout } from "../utils/stdio.js";
import { resolveProjectRoots } from "../context/repoRoots.js";

export interface StartWebShellOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  port?: number;
}

function detectLanIp(): string | null {
  const interfaces = os.networkInterfaces();
  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
  }
  return null;
}

function printBanner(port: number): void {
  const lanIp = detectLanIp();
  writeStdoutLine("");
  writeStdoutLine("小猫智能体");
  writeStdoutLine("");
  writeStdoutLine(`局域网地址: http://${lanIp ?? "localhost"}:${port}`);
  writeStdoutLine("用手机浏览器打开此地址");
  writeStdoutLine("");
  writeStdoutLine("终端日志 — 服务端日志输出");
  writeStdoutLine("Ctrl+C 停止服务");
  writeStdoutLine("");
}

export async function startWebShell(options: StartWebShellOptions): Promise<void> {
  const port = options.port ?? 3000;

  const session = options.session;
  const server = http.createServer((req, res) => {
    if (req.url === "/" || req.url === "") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(serveHtml());
    } else {
      res.writeHead(404);
      res.end("Not found");
    }
  });

  // Create WebSocket server attached to the HTTP server
  const wss = new WebSocketServer({ server });

  // WebSocket connection logging + replay history
  wss.on("connection", async (ws) => {
    writeStdoutLine("[web] 客户端已连接");
    // Try to replay history from persisted session; for a new session not yet
    // saved to disk, fall back to the in-memory session (which may be empty).
    let current: SessionRecord;
    try {
      current = await options.sessionStore.load(session.id);
    } catch (err) {
      if (isSessionNotFoundError(err)) {
        // New session not yet persisted – use in-memory state
        current = session;
      } else {
        writeStdoutLine(`[web] 加载历史消息失败: ${err}`);
        current = session;
      }
    }
    for (const msg of current.messages) {
      if (msg.role === "user" && msg.content) {
        ws.send(JSON.stringify({ type: "user", text: msg.content }));
      } else if (msg.role === "assistant") {
        if (msg.reasoningContent) {
          ws.send(JSON.stringify({ type: "reasoning", text: msg.reasoningContent }));
        }
        if (msg.content) {
          ws.send(JSON.stringify({ type: "message", text: msg.content }));
        }
      }
    }
    ws.on("close", () => {
      writeStdoutLine("[web] 客户端已断开");
    });
    ws.on("error", (err) => {
      writeStdoutLine(`[web] 客户端错误: ${err.message}`);
    });
  });

  server.listen(port, "0.0.0.0", () => {
    printBanner(port);
  });

  // Create the web interaction shell
  const shell = createWebInteractionShell(wss);

  // Create and run the session driver
  const driverOptions: InteractiveSessionDriverOptions = {
    cwd: options.cwd,
    config: options.config,
    session,
    sessionStore: options.sessionStore,
    shell,
    stateRootDir: (await resolveProjectRoots(options.cwd)).stateRootDir,
  };

  const driver = new InteractiveSessionDriver(driverOptions);

  try {
    await driver.run();
  } finally {
    shell.dispose?.();
    // Close the server
    await new Promise<void>((resolve) => {
      wss.close(() => {
        server.close(() => resolve());
      });
    });
  }
}
