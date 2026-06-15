import type { InteractionTurnDisplay } from "../interaction/shell.js";
import type { AgentCallbacks } from "../agent/types.js";
import { WebSocketServer } from "ws";

function broadcast(wss: WebSocketServer, data: object): void {
  const text = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(text);
    }
  });
}

export function createWebTurnDisplay(options: {
  wss: WebSocketServer;
  config: { showReasoning?: boolean };
  abortSignal: AbortSignal;
}): InteractionTurnDisplay {
  const callbacks: AgentCallbacks = {
    onModelWaitStart() {
      broadcast(options.wss, { type: "status", text: "🐱 thinking..." });
    },
    onModelWaitStop() {
      broadcast(options.wss, { type: "status", text: "" });
    },
    onReasoningDelta(delta: string) {
      if (options.config.showReasoning) {
        broadcast(options.wss, { type: "reasoning_delta", text: delta });
      }
    },
    onReasoning(text: string) {
      if (options.config.showReasoning) {
        broadcast(options.wss, { type: "reasoning", text });
      }
    },
    onAssistantDelta(delta: string) {
      broadcast(options.wss, { type: "delta", text: delta });
    },
    onAssistantText(text: string) {
      broadcast(options.wss, { type: "message", text });
    },
    onAssistantDone(_fullText: string) {
      broadcast(options.wss, { type: "done" });
    },
    onAssistantStage(text: string) {
      broadcast(options.wss, { type: "message", text });
    },
    onToolCall(name: string, _args: string) {
      broadcast(options.wss, { type: "status", text: `🔧 ${name}` });
    },
    onToolResult(name: string, _output: string) {
      broadcast(options.wss, { type: "status", text: `✅ ${name}` });
    },
    onToolError(name: string, _error: string) {
      broadcast(options.wss, { type: "status", text: `❌ ${name}` });
    },
    onStatus(text: string) {
      broadcast(options.wss, { type: "status", text });
    },
  };

  return {
    callbacks,
    flush(): void {
      // WebSocket is real-time, no buffering needed
    },
    dispose(): void {
      // Nothing to clean up per-turn
    },
  };
}
