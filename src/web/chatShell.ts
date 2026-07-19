import type { AgentCallbacks } from "../agent/types.js";
import type { InteractionShell, ShellInputResult } from "../interaction/shell.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { projectToolCallPresentation, projectToolResultPresentation, type ToolCallPresentation, type ToolResultPresentation } from "../runtime-ui/toolPresentation.js";
import { WebSocket, WebSocketServer } from "ws";
import { parseSubmittedInputEcho } from "../interaction/submittedInput.js";

type WebEvent = Record<string, unknown>;

export interface WebShellLabels {
  back: string;
  history: string;
  newSession: string;
  commands: readonly { name: string; description: string; category: string }[];
  connected: string;
  disconnected: string;
  thinking: string;
  stopped: string;
  inputPlaceholder: string;
  send: string;
  stop: string;
  empty: string;
  reasoning: string;
  user: string;
  assistant: string;
  toolUpdating: string;
  toolWriting: string;
  toolReading: string;
  toolReadingGeneric: string;
  toolRunning: string;
  toolRunningGeneric: string;
  toolCalling: string;
  toolUpdated: string;
  toolCreated: string;
  toolRead: string;
  toolDone: string;
  toolPlan: string;
  commandDone: string;
  commandFailed: string;
  toolFailed: string;
}

export class WebChatShell implements InteractionShell {
  private readonly clients = new Set<WebSocket>();
  private readonly replaying = new Set<WebSocket>();
  private readonly replayQueues = new Map<WebSocket, WebEvent[]>();
  private readonly queuedInputs: string[] = [];
  private readonly interruptHandlers = new Set<() => void>();
  private readonly pendingTools = new Map<string, number[]>();
  private toolSequence = 0;

  constructor(private readonly labels: WebShellLabels) {}
  private pendingInput: ((result: ShellInputResult) => void) | undefined;

  readonly input = {
    readInput: (_promptLabel?: string): Promise<ShellInputResult> => {
      const next = this.queuedInputs.shift();
      if (next !== undefined) return Promise.resolve({ kind: "submit", value: next });
      return new Promise((resolve) => { this.pendingInput = resolve; });
    },
    bindInterrupt: (handler: () => void): (() => void) => {
      this.interruptHandlers.add(handler);
      return () => this.interruptHandlers.delete(handler);
    },
    close: (): void => {
      const pending = this.pendingInput;
      this.pendingInput = undefined;
      pending?.({ kind: "closed" });
    },
  };

  readonly output = {
    plain: (text: string): void => this.broadcast({ type: "user", text: parseSubmittedInputEcho(text) ?? text }),
    info: (text: string): void => this.broadcast({ type: "status", text }),
    warn: (text: string): void => this.broadcast({ type: "status", text }),
    error: (text: string): void => this.broadcast({ type: "status", text }),
    dim: (_text: string): void => undefined,
    heading: (text: string): void => this.broadcast({ type: "status", text }),
    interrupt: (text: string): void => this.broadcast({ type: "interrupt", text }),
  };

  attach(server: WebSocketServer, replay: (send: (event: WebEvent) => void) => Promise<void>, onControl?: (message: { type: "session_select"; sessionId: string }) => void): void {
    server.on("connection", (socket) => {
      this.clients.add(socket);
      this.sendRaw(socket, { type: "presentation", labels: this.labels });
      this.replaying.add(socket);
      this.replayQueues.set(socket, []);
      void (async () => {
        try {
          await replay((event) => this.sendRaw(socket, event));
        } finally {
          this.replaying.delete(socket);
          const queued = this.replayQueues.get(socket) ?? [];
          this.replayQueues.delete(socket);
          for (const event of queued) this.sendRaw(socket, event);
        }
      })();
      socket.on("message", (raw) => this.handleMessage(raw.toString(), onControl));
      socket.on("close", () => this.removeClient(socket));
      socket.on("error", () => this.removeClient(socket));
    });
  }

  broadcastSessionCatalog(activeSessionId: string | undefined, sessions: readonly { id: string; title?: string; updatedAt: string; messageCount: number }[]): void {
    this.broadcast({ type: "session_catalog", activeSessionId, sessions });
  }

  broadcastSessionReplay(session: SessionRecord): void {
    this.replaySession(session, (event) => this.broadcast(event));
  }

  createTurnDisplay(options: { cwd: string; config: RuntimeConfig; abortSignal: AbortSignal }) {
    const callbacks: AgentCallbacks = {
      onModelWaitStart: () => this.broadcast({ type: "status", text: this.labels.thinking }),
      onModelWaitStop: () => this.broadcast({ type: "status", text: "" }),
      onAssistantDelta: (text) => this.broadcast({ type: "delta", text }),
      onAssistantText: (text) => this.broadcast({ type: "message", text }),
      onAssistantDone: () => this.broadcast({ type: "done" }),
      onAssistantStage: (text) => this.broadcast({ type: "message", text }),
      onReasoningDelta: (text) => { if (options.config.showReasoning) this.broadcast({ type: "reasoning_delta", text }); },
      onReasoning: (text) => { if (options.config.showReasoning) this.broadcast({ type: "reasoning", text }); },
      onToolCall: (name, payload) => {
        const id = ++this.toolSequence;
        const ids = this.pendingTools.get(name) ?? [];
        ids.push(id);
        this.pendingTools.set(name, ids);
        this.broadcast({ type: "tool_call", id, name, summary: formatToolCall(this.labels, projectToolCallPresentation(name, payload)) });
      },
      onToolResult: (name, payload) => {
        const id = this.takeToolId(name);
        this.broadcast({ type: "tool_result", id, name, summary: formatToolResult(this.labels, projectToolResultPresentation(name, payload)) });
      },
      onToolError: (name, error) => {
        const id = this.takeToolId(name);
        this.broadcast({
          type: "tool_error",
          id,
          name,
          summary: formatToolResult(this.labels, projectToolResultPresentation(name, error)),
        });
      },
      onStatus: (text) => this.broadcast({ type: "status", text }),
    };
    return {
      callbacks,
      flush: (): void => undefined,
      dispose: (): void => undefined,
    };
  }

  private takeToolId(name: string): number | undefined {
    const ids = this.pendingTools.get(name);
    const id = ids?.shift();
    if (ids?.length === 0) this.pendingTools.delete(name);
    return id;
  }

  replaySession(session: SessionRecord, send: (event: WebEvent) => void): void {
    const replayToolIds = new Map<string, number>();
    for (const message of session.messages) {
      if (message.role === "user" && message.content) send({ type: "user", text: message.content });
      if (message.role === "assistant") {
        if (message.reasoningContent) send({ type: "reasoning", text: message.reasoningContent });
        if (message.tool_calls?.length) {
          for (const toolCall of message.tool_calls) {
            const id = ++this.toolSequence;
            replayToolIds.set(toolCall.id, id);
            send({
              type: "tool_call",
              id,
              name: toolCall.function.name,
              summary: formatToolCall(this.labels, projectToolCallPresentation(toolCall.function.name, toolCall.function.arguments)),
            });
          }
        } else if (message.content) {
          send({ type: "message", text: message.content });
        }
      }
      if (message.role === "tool") {
        const id = message.tool_call_id ? replayToolIds.get(message.tool_call_id) : undefined;
        const name = message.name ?? message.toolResult?.toolName ?? "tool";
        const failed = message.toolResult?.status === "error";
        const summary = message.toolResult?.summary
          ?? formatToolResult(this.labels, projectToolResultPresentation(name, message.toolResult?.modelView ?? message.content ?? ""));
        send({ type: failed ? "tool_error" : "tool_result", id, name, summary });
      }
    }
  }

  dispose(): void {
    this.input.close();
    for (const client of this.clients) client.close();
    this.clients.clear();
    this.replaying.clear();
    this.replayQueues.clear();
  }

  private handleMessage(raw: string, onControl?: (message: { type: "session_select"; sessionId: string }) => void): void {
    let message: { type?: string; text?: string };
    try { message = JSON.parse(raw) as { type?: string; text?: string }; } catch { return; }
    if (message.type === "input" && typeof message.text === "string") {
      const text = message.text.trim();
      if (!text) return;
      const pending = this.pendingInput;
      this.pendingInput = undefined;
      if (pending) pending({ kind: "submit", value: text });
      else this.queuedInputs.push(text);
      return;
    }
    if (message.type === "interrupt") {
      for (const handler of this.interruptHandlers) handler();
      return;
    }
    if (message.type === "session_select" && typeof (message as { sessionId?: unknown }).sessionId === "string") {
      onControl?.({ type: "session_select", sessionId: (message as { sessionId: string }).sessionId });
    }
  }

  private broadcast(event: WebEvent): void {
    for (const client of this.clients) this.send(client, event);
  }

  private send(client: WebSocket, event: WebEvent): void {
    if (this.replaying.has(client)) {
      this.replayQueues.get(client)?.push(event);
      return;
    }
    this.sendRaw(client, event);
  }

  private sendRaw(client: WebSocket, event: WebEvent): void {
    if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(event));
  }

  private removeClient(client: WebSocket): void {
    this.clients.delete(client);
    this.replaying.delete(client);
    this.replayQueues.delete(client);
  }
}

function formatToolCall(labels: WebShellLabels, presentation: ToolCallPresentation): string {
  switch (presentation.kind) {
    case "change": return presentation.target ? interpolate(labels.toolUpdating, { target: presentation.target }) : labels.toolWriting;
    case "read": return presentation.target ? interpolate(labels.toolReading, { target: presentation.target }) : labels.toolReadingGeneric;
    case "command": return presentation.command ? interpolate(labels.toolRunning, { command: presentation.command }) : labels.toolRunningGeneric;
    default: return interpolate(labels.toolCalling, { name: presentation.name });
  }
}

function formatToolResult(labels: WebShellLabels, presentation: ToolResultPresentation): string {
  switch (presentation.kind) {
    case "change": return interpolate(presentation.action === "created" ? labels.toolCreated : labels.toolUpdated, { target: presentation.path });
    case "document-change": return interpolate(presentation.action === "created" ? labels.toolCreated : labels.toolUpdated, { target: presentation.path });
    case "read": return interpolate(labels.toolRead, { target: presentation.path });
    case "command": return presentation.status === "failed" ? labels.commandFailed : labels.commandDone;
    case "plan": return interpolate(labels.toolPlan, { completed: presentation.completed, total: presentation.items.length });
    case "error": return `${labels.toolFailed}: ${presentation.message}`;
    default: return labels.toolDone;
  }
}

function interpolate(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{([a-zA-Z][a-zA-Z0-9]*)\}/g, (_, key: string) => String(values[key] ?? ""));
}
