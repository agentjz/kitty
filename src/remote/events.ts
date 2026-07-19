import { EventEmitter } from "node:events";

import type { AgentCallbacks, ToolCallProgress } from "../agent/types.js";
import { buildToolFailureDetail } from "../runtime-ui/toolDisplay.js";
import { normalizeDisplayPath } from "../runtime-ui/pathDisplay.js";
import { projectToolCallPresentation, projectToolResultPresentation } from "../runtime-ui/toolPresentation.js";
import { translate, type KittyLocale } from "../i18n/index.js";

export interface RemoteRuntimePresentation {
  title: string;
  detail?: string;
  format?: "text" | "markdown" | "preformatted";
  state?: "running" | "success" | "error";
}

export interface RemoteRuntimeEvent {
  rootDir: string;
  host: "telegram" | "weixin";
  peerKey: string;
  sessionId: string;
  kind: "inbound" | "status" | "reasoning" | "assistant" | "final" | "tool_call" | "tool_progress" | "tool_result" | "tool_error" | "error";
  text?: string;
  toolName?: string;
  payload?: string;
  presentation?: RemoteRuntimePresentation;
  createdAt: string;
}

const emitter = new EventEmitter();

export function publishRemoteRuntimeEvent(event: Omit<RemoteRuntimeEvent, "createdAt">): void {
  emitter.emit("event", { ...event, createdAt: new Date().toISOString() } satisfies RemoteRuntimeEvent);
}

export function subscribeRemoteRuntimeEvents(listener: (event: RemoteRuntimeEvent) => void): () => void {
  emitter.on("event", listener);
  return () => emitter.off("event", listener);
}

export function createRemoteObservationCallbacks(
  facts: Pick<RemoteRuntimeEvent, "rootDir" | "host" | "peerKey" | "sessionId"> & { locale: KittyLocale },
): AgentCallbacks {
  const { locale, ...eventFacts } = facts;
  const publish = (event: Omit<RemoteRuntimeEvent, "createdAt" | "rootDir" | "host" | "peerKey" | "sessionId">) =>
    publishRemoteRuntimeEvent({ ...eventFacts, ...event });
  return {
    onStatus: (text) => publish({ kind: "status", text }),
    onAssistantStage: (text) => publish({ kind: "assistant", text }),
    onAssistantDelta: (text) => publish({ kind: "assistant", text }),
    onAssistantText: (text) => publish({ kind: "assistant", text }),
    onAssistantDone: (text) => publish({ kind: "final", text }),
    onReasoningDelta: (text) => publish({ kind: "reasoning", text }),
    onReasoning: (text) => publish({ kind: "reasoning", text }),
    onToolCallProgress: (progress) => publish({
      kind: "tool_progress",
      toolName: progress.name,
      payload: JSON.stringify(progress),
      presentation: projectProgressPresentation(progress, locale),
    }),
    onToolCall: (name, payload) => publish({
      kind: "tool_call",
      toolName: name,
      payload,
      presentation: projectCallPresentation(name, payload, facts.rootDir, locale),
    }),
    onToolResult: (name, payload) => publish({
      kind: "tool_result",
      toolName: name,
      payload,
      presentation: projectResultPresentation(name, payload, facts.rootDir, locale),
    }),
    onToolError: (name, payload) => publish({
      kind: "tool_error",
      toolName: name,
      payload,
      presentation: {
        title: translate(locale, "web.event.toolFailed", { name }),
        detail: buildToolFailureDetail(name, payload, facts.rootDir),
        format: "text",
        state: "error",
      },
    }),
  };
}

function projectProgressPresentation(progress: ToolCallProgress, locale: KittyLocale): RemoteRuntimePresentation {
  return {
    title: translate(locale, "web.event.toolProgress", { name: progress.name }),
    detail: formatBytes(progress.argumentBytesReceived),
    format: "text",
    state: "running",
  };
}

function projectCallPresentation(name: string, payload: string, rootDir: string, locale: KittyLocale): RemoteRuntimePresentation {
  const presentation = projectToolCallPresentation(name, payload);
  switch (presentation.kind) {
    case "change":
      return {
        title: translate(locale, presentation.name === "document_write" ? "web.event.writeDocument" : "web.event.changeFile"),
        detail: displayPath(presentation.target, rootDir, locale),
        format: "text",
        state: "running",
      };
    case "read": {
      const range = presentation.offset === undefined
        ? ""
        : presentation.limit === undefined
          ? ` · ${translate(locale, "web.event.fromOffset", { offset: presentation.offset })}`
          : ` · ${presentation.offset}-${presentation.offset + presentation.limit - 1}`;
      return {
        title: translate(locale, presentation.name === "document_read" ? "web.event.readDocument" : "web.event.readFile"),
        detail: `${displayPath(presentation.target, rootDir, locale)}${range}`,
        format: "text",
        state: "running",
      };
    }
    case "command":
      return {
        title: translate(locale, "web.event.runCommand"),
        detail: [presentation.command, presentation.cwd ? translate(locale, "web.event.directory", { path: displayPath(presentation.cwd, rootDir, locale) }) : undefined]
          .filter(Boolean).join("\n"),
        format: "preformatted",
        state: "running",
      };
    case "tool":
      return { title: translate(locale, "web.event.runTool", { name }), state: "running" };
  }
}

function projectResultPresentation(name: string, payload: string, rootDir: string, locale: KittyLocale): RemoteRuntimePresentation {
  const presentation = projectToolResultPresentation(name, payload);
  switch (presentation.kind) {
    case "change":
      return {
        title: translate(locale, presentation.action === "created" ? "web.event.fileCreated" : "web.event.fileUpdated"),
        detail: `${displayPath(presentation.path, rootDir, locale)} · +${presentation.addedLines} -${presentation.removedLines}`,
        format: "text",
        state: "success",
      };
    case "document-change":
      return {
        title: translate(locale, presentation.action === "created" ? "web.event.documentCreated" : "web.event.documentUpdated"),
        detail: `${displayPath(presentation.path, rootDir, locale)}${presentation.bytes === undefined ? "" : ` · ${formatBytes(presentation.bytes)}`}`,
        format: "text",
        state: "success",
      };
    case "read": {
      const range = presentation.startLine !== undefined && presentation.endLine !== undefined
        ? ` · ${presentation.startLine}-${presentation.endLine}`
        : presentation.startUnit !== undefined && presentation.endUnit !== undefined
          ? ` · ${presentation.startUnit}-${presentation.endUnit}`
          : "";
      return {
        title: translate(locale, "web.event.readComplete"),
        detail: `${displayPath(presentation.path, rootDir, locale)}${range}`,
        format: "text",
        state: "success",
      };
    }
    case "command":
      return {
        title: translate(locale, presentation.status === "failed" ? "web.event.commandFailed" : "web.event.commandComplete"),
        detail: [presentation.command, presentation.status, presentation.durationMs === undefined ? undefined : `${presentation.durationMs} ms`]
          .filter(Boolean).join(" · "),
        format: "preformatted",
        state: presentation.status === "failed" ? "error" : "success",
      };
    case "plan":
      return {
        title: translate(locale, "web.event.planUpdated", { completed: presentation.completed, total: presentation.items.length }),
        detail: presentation.items.map((item) => {
          const mark = item.status === "completed" ? "[x]" : item.status === "in_progress" ? "[>]" : "[ ]";
          return `${mark} ${item.text}`;
        }).join("\n"),
        format: "preformatted",
        state: "success",
      };
    case "error":
      return {
        title: translate(locale, "web.event.toolFailed", { name }),
        detail: presentation.message,
        format: "text",
        state: "error",
      };
    case "none":
      return { title: translate(locale, "web.event.toolComplete", { name }), state: "success" };
  }
}

function displayPath(value: string | undefined, rootDir: string, locale: KittyLocale): string {
  return normalizeDisplayPath(value, rootDir) ?? value ?? translate(locale, "web.event.missingTarget");
}

function formatBytes(bytes: number): string {
  if (bytes < 1_000) return `${bytes} B`;
  if (bytes < 1_000_000) return `${(bytes / 1_000).toFixed(bytes >= 10_000 ? 0 : 1)} kB`;
  return `${(bytes / 1_000_000).toFixed(bytes >= 10_000_000 ? 0 : 1)} MB`;
}

export function teeAgentCallbacks(primary: AgentCallbacks, observer: AgentCallbacks): AgentCallbacks {
  return {
    onModelWaitStart: () => { primary.onModelWaitStart?.(); observer.onModelWaitStart?.(); },
    onModelWaitStop: () => { primary.onModelWaitStop?.(); observer.onModelWaitStop?.(); },
    onStatus: (text) => { primary.onStatus?.(text); observer.onStatus?.(text); },
    onAssistantStage: (text) => { primary.onAssistantStage?.(text); observer.onAssistantStage?.(text); },
    onAssistantDelta: (text) => { primary.onAssistantDelta?.(text); observer.onAssistantDelta?.(text); },
    onAssistantDone: (text) => { primary.onAssistantDone?.(text); observer.onAssistantDone?.(text); },
    onAssistantText: (text) => { primary.onAssistantText?.(text); observer.onAssistantText?.(text); },
    onReasoningDelta: (text) => { primary.onReasoningDelta?.(text); observer.onReasoningDelta?.(text); },
    onReasoning: (text) => { primary.onReasoning?.(text); observer.onReasoning?.(text); },
    onToolCallProgress: (progress: ToolCallProgress) => { primary.onToolCallProgress?.(progress); observer.onToolCallProgress?.(progress); },
    onToolCall: (name, args) => { primary.onToolCall?.(name, args); observer.onToolCall?.(name, args); },
    onToolResult: (name, output) => { primary.onToolResult?.(name, output); observer.onToolResult?.(name, output); },
    onToolError: (name, error) => { primary.onToolError?.(name, error); observer.onToolError?.(name, error); },
    enqueueFile: primary.enqueueFile,
  };
}
