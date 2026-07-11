import {
  findLatestUserIndex,
  shouldIncludeStoredAssistantReasoning,
} from "../../../session/messages.js";
import type { StoredMessage } from "../../../types.js";

export function normalizeProviderReplayMessages(
  messages: StoredMessage[],
  model: string,
  provider: string,
): StoredMessage[] {
  if (!providerNeedsReasoningReplay(model, provider)) {
    return messages;
  }

  const normalized: StoredMessage[] = [];
  const latestUserIndex = findLatestUserIndex(messages);
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index]!;
    if (index >= latestUserIndex || !isUnreplayableToolCallAssistant(message)) {
      normalized.push(message);
      continue;
    }

    const toolCallIds = new Set(message.tool_calls!.map((toolCall) => toolCall.id));
    const toolMessages: StoredMessage[] = [];
    let cursor = index + 1;
    while (cursor < messages.length) {
      const candidate = messages[cursor]!;
      if (candidate.role !== "tool" || !candidate.tool_call_id || !toolCallIds.has(candidate.tool_call_id)) {
        break;
      }
      toolMessages.push(candidate);
      cursor += 1;
    }

    normalized.push({
      ...message,
      content: summarizeUnreplayableToolBatch(message, toolMessages),
      tool_calls: undefined,
      reasoningContent: undefined,
    });
    index = Math.max(index, cursor - 1);
  }

  return normalized;
}

export function shouldIncludeProviderReplayReasoning(
  messages: StoredMessage[],
  index: number,
  model: string,
  provider: string,
): boolean {
  return shouldIncludeStoredAssistantReasoning(messages, index, model, provider);
}

function providerNeedsReasoningReplay(model: string, provider: string): boolean {
  return shouldIncludeStoredAssistantReasoning([
    {
      role: "assistant",
      content: "",
      reasoningContent: "probe",
      createdAt: "1970-01-01T00:00:00.000Z",
    },
  ], 0, model, provider);
}

function isUnreplayableToolCallAssistant(message: StoredMessage): boolean {
  return message.role === "assistant" &&
    Array.isArray(message.tool_calls) &&
    message.tool_calls.length > 0 &&
    message.reasoningContent === undefined;
}

function summarizeUnreplayableToolBatch(
  assistant: StoredMessage,
  toolMessages: StoredMessage[],
): string {
  const toolNames = (assistant.tool_calls ?? [])
    .map((toolCall) => toolCall.function.name)
    .filter(Boolean)
    .join(", ");
  const assistantText = oneLine(assistant.content ?? "");
  const toolFacts = toolMessages
    .map((message) => `Tool ${message.name ?? message.tool_call_id ?? "unknown"} returned: ${truncate(oneLine(message.content ?? ""), 360)}`)
    .join("\n");

  return [
    "Previous tool batch summary.",
    toolNames ? `Tools: ${toolNames}.` : undefined,
    assistantText ? `Assistant note: ${truncate(assistantText, 360)}` : undefined,
    toolFacts || "Tool result was not available in the replayable context.",
  ].filter(Boolean).join("\n");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : `${value.slice(0, maxChars)}...`;
}
