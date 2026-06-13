import type { InteractionShell, InteractionTurnDisplay } from "../interaction/shell.js";
import type { RuntimeConfig } from "../types.js";
import { WebSocketServer } from "ws";
import { createWebInputPort } from "./inputPort.js";
import { createWebOutputPort } from "./outputPort.js";
import { createWebTurnDisplay } from "./turnDisplay.js";

export function createWebInteractionShell(wss: WebSocketServer): InteractionShell {
  return {
    input: createWebInputPort(wss),
    output: createWebOutputPort(wss),
    createTurnDisplay(options: {
      cwd: string;
      config: RuntimeConfig;
      abortSignal: AbortSignal;
    }): InteractionTurnDisplay {
      return createWebTurnDisplay({
        wss,
        abortSignal: options.abortSignal,
      });
    },
    dispose(): void {
      // WebSocket server is closed externally
    },
  };
}
