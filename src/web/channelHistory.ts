import { resolveRuntimeConfig } from "../config/runtime.js";
import { FileTelegramSessionMapStore } from "../telegram/sessionMapStore.js";
import { SessionStore } from "../session/store.js";
import type { StoredMessage } from "../types.js";
import { WeixinSessionMapStore } from "../weixin/state.js";

export type WebChannelName = "weixin" | "telegram";

export interface WebChannelHistoryItem {
  host: WebChannelName;
  peerKey: string;
  sessionId: string;
  kind: "inbound" | "reasoning" | "final";
  text: string;
  createdAt: string;
}

export async function loadChannelHistory(cwd: string, host: WebChannelName): Promise<WebChannelHistoryItem[]> {
  const config = await resolveRuntimeConfig({ cwd });
  const bindings = host === "weixin"
    ? await new WeixinSessionMapStore(config.weixin.sessionMapFile).list()
    : await new FileTelegramSessionMapStore(path.join(config.telegram.stateDir, "session-map.json")).list();
  const sessions = new SessionStore(config.paths.sessionsDir);
  const history: WebChannelHistoryItem[] = [];

  for (const binding of bindings) {
    let session;
    try {
      session = await sessions.load(binding.sessionId);
    } catch {
      continue;
    }
    for (const message of session.messages) {
      history.push(...projectMessage(host, binding.peerKey, session.id, message));
    }
  }

  return history.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function projectMessage(
  host: WebChannelName,
  peerKey: string,
  sessionId: string,
  message: StoredMessage,
): WebChannelHistoryItem[] {
  if (message.source === "internal") return [];
  if (message.role === "user") {
    return message.content
      ? [{ host, peerKey, sessionId, kind: "inbound", text: message.content, createdAt: message.createdAt }]
      : [];
  }
  if (message.role !== "assistant") return [];

  const items: WebChannelHistoryItem[] = [];
  if (message.reasoningContent) {
    items.push({ host, peerKey, sessionId, kind: "reasoning", text: message.reasoningContent, createdAt: message.createdAt });
  }
  if (message.content && !message.tool_calls?.length) {
    items.push({ host, peerKey, sessionId, kind: "final", text: message.content, createdAt: message.createdAt });
  }
  return items;
}
import path from "node:path";
