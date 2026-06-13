import type { ShellOutputPort } from "../interaction/shell.js";
import { WebSocketServer } from "ws";

function broadcast(wss: WebSocketServer, data: object): void {
  const text = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(text);
    }
  });
}

export function createWebOutputPort(wss: WebSocketServer): ShellOutputPort {
  return {
    plain(text: string): void {
      // formatSubmittedInput output: display as user message on the right
      broadcast(wss, { type: "user", text });
    },
    info(_text: string): void {
      // Not pushed to web — terminal only
    },
    warn(text: string): void {
      broadcast(wss, { type: "status", text });
    },
    error(text: string): void {
      broadcast(wss, { type: "status", text });
    },
    dim(_text: string): void {
      // Terminal only
    },
    heading(_text: string): void {
      // Terminal only
    },
    interrupt(text: string): void {
      broadcast(wss, { type: "interrupt", text });
    },
  };
}
