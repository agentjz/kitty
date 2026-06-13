import type { ShellInputPort, ShellInputResult, ShellMultilineInputResult } from "../interaction/shell.js";
import { WebSocketServer } from "ws";

export function createWebInputPort(wss: WebSocketServer): ShellInputPort {
  const interruptHandlers = new Set<() => void>();
  let pendingResolve: ((result: ShellInputResult) => void) | null = null;
  const messageQueue: string[] = [];

  wss.on("connection", (socket) => {
    socket.on("message", (raw) => {
      let msg: { type: string; text?: string };
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "input" && msg.text !== undefined) {
        if (pendingResolve) {
          const resolve = pendingResolve;
          pendingResolve = null;
          resolve({ kind: "submit", value: msg.text });
        } else {
          messageQueue.push(msg.text);
        }
      } else if (msg.type === "interrupt") {
        for (const handler of interruptHandlers) {
          handler();
        }
      }
    });
  });

  return {
    readInput(_promptLabel?: string): Promise<ShellInputResult> {
      const next = messageQueue.shift();
      if (next !== undefined) {
        return Promise.resolve({ kind: "submit", value: next });
      }

      return new Promise((resolve) => {
        pendingResolve = resolve;
      });
    },

    readMultiline(_promptLabel?: string): Promise<ShellMultilineInputResult> {
      return this.readInput(_promptLabel).then((result) => {
        if (result.kind === "submit") {
          return { kind: "submit" as const, value: result.value };
        }
        return { kind: "cancel" as const };
      });
    },

    bindInterrupt(handler: () => void): () => void {
      interruptHandlers.add(handler);
      return () => {
        interruptHandlers.delete(handler);
      };
    },
  };
}
