import { expandStartToToolBoundary, findLatestUserIndex, shouldIncludeStoredAssistantReasoning } from "../../../session/messages.js";
import { joinBlocks, renderPromptLayers } from "../../../agent/prompt/format.js";
import { measurePromptLayers } from "../../../agent/prompt/metrics.js";
import { isInternalMessage } from "../../../session/turnFrame.js";
import { buildVisibleConversationWindow } from "../conversationWindow.js";
import { buildContextBudgetReport } from "../budget.js";
import type { ProviderMessage } from "../../../provider/contract.js";
import type { PromptLayerMetrics, PromptLayers } from "../../../agent/prompt/types.js";
import type { RuntimeConfig, StoredMessage } from "../../../types.js";
import type { ContextBudgetReport, ContextCacheLayoutReport } from "../../../types/contextBudget.js";
import type { ContextRuntimeRequest } from "../types.js";

const MIN_TAIL_MESSAGES = 8;
const DETAILED_RECENT_MESSAGES = 8;
const HARD_TAIL_COUNTS = [8, 6, 4, 2, 1];
const MAX_SUMMARY_MESSAGE_COUNT = 48;

export function buildCompressedContextRequest(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
  config: Pick<RuntimeConfig, "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars"> & {
    provider?: RuntimeConfig["provider"];
  },
): ContextRuntimeRequest {
  const safeMaxChars = Math.max(8_000, config.maxContextChars);
  const conversation = buildVisibleConversationWindow(messages);
  const conversationMessages = conversation.messages;
  const provider = config.provider ?? "openai-compatible";
  const fullMessages = composeChatMessages(systemPrompt, conversationMessages, config.model, provider);
  const initialEstimatedChars = estimateChatMessagesChars(fullMessages);
  const initialPromptMetrics = measureSystemPrompt(systemPrompt);
  const initialSources = buildBudgetSources(systemPrompt, conversationMessages);
  const initialCacheLayout = buildCacheLayoutReport(systemPrompt, conversationMessages);

  if (initialEstimatedChars <= safeMaxChars) {
    return {
      messages: fullMessages,
      compressed: false,
      estimatedChars: initialEstimatedChars,
      budget: buildContextBudgetReport({
        limitChars: safeMaxChars,
        estimatedChars: initialEstimatedChars,
        compressed: false,
        sources: initialSources,
        promptHotspots: initialPromptMetrics?.hotspots,
        cacheLayout: initialCacheLayout,
      }),
      promptMetrics: initialPromptMetrics,
      cacheLayout: initialCacheLayout,
    };
  }

  let tailCount = Math.max(1, Math.min(conversationMessages.length, config.contextWindowMessages));

  while (true) {
    const tailMessages = sliceTailMessages(conversationMessages, tailCount);
    const compressedFrameHead = conversationMessages.slice(0, Math.max(0, conversationMessages.length - tailMessages.length));
    const summary =
      compressedFrameHead.length > 0
        ? summarizeConversation(compressedFrameHead, config.contextSummaryChars)
        : undefined;
    const summaryPrompt = appendSummary(systemPrompt, summary);

    let workingTail = compactTailMessages(tailMessages, "normal");
    let requestMessages = composeChatMessages(summaryPrompt, workingTail, config.model, provider);
    let estimatedChars = estimateChatMessagesChars(requestMessages);
    let promptMetrics = measureSystemPrompt(summaryPrompt);
    let cacheLayout = buildCacheLayoutReport(summaryPrompt, workingTail);

    if (estimatedChars <= safeMaxChars) {
      return {
        messages: requestMessages,
        compressed: Boolean(summary),
        estimatedChars,
        budget: buildContextBudgetReport({
          limitChars: safeMaxChars,
          estimatedChars,
          compressed: Boolean(summary),
          summary,
          sources: buildBudgetSources(systemPrompt, workingTail, summary),
          promptHotspots: promptMetrics?.hotspots,
          compressionMode: summary ? "normal" : "none",
          cacheLayout,
        }),
        summary,
        promptMetrics,
        cacheLayout,
      };
    }

    workingTail = compactTailMessages(tailMessages, "aggressive");
    requestMessages = composeChatMessages(summaryPrompt, workingTail, config.model, provider);
    estimatedChars = estimateChatMessagesChars(requestMessages);
    promptMetrics = measureSystemPrompt(summaryPrompt);
    cacheLayout = buildCacheLayoutReport(summaryPrompt, workingTail);

    if (estimatedChars <= safeMaxChars) {
      return {
        messages: requestMessages,
        compressed: true,
        estimatedChars,
        budget: buildContextBudgetReport({
          limitChars: safeMaxChars,
          estimatedChars,
          compressed: true,
          summary,
          sources: buildBudgetSources(systemPrompt, workingTail, summary),
          promptHotspots: promptMetrics?.hotspots,
          compressionMode: "aggressive",
          cacheLayout,
        }),
        summary,
        promptMetrics,
        cacheLayout,
      };
    }

    if (tailCount > MIN_TAIL_MESSAGES) {
      tailCount = Math.max(MIN_TAIL_MESSAGES, tailCount - 4);
      continue;
    }

    const hardSummary = summary ? truncate(summary, Math.max(600, Math.floor(config.contextSummaryChars * 0.4))) : undefined;
    const hardPrompt = appendSummary(systemPrompt, hardSummary);

    for (const hardTailCount of HARD_TAIL_COUNTS) {
      const hardTail = sliceTailMessages(conversationMessages, Math.min(hardTailCount, conversationMessages.length));
      const compactedHardTail = compactTailMessages(hardTail, "hard");
      const hardMessages = composeChatMessages(
        hardPrompt,
        compactedHardTail,
        config.model,
        provider,
      );
      const hardEstimatedChars = estimateChatMessagesChars(hardMessages);
      const hardCacheLayout = buildCacheLayoutReport(hardPrompt, compactedHardTail);
      if (hardEstimatedChars <= safeMaxChars || hardTailCount === 1) {
        return {
          messages: hardMessages,
          compressed: true,
          estimatedChars: hardEstimatedChars,
          budget: buildContextBudgetReport({
            limitChars: safeMaxChars,
            estimatedChars: hardEstimatedChars,
            compressed: true,
            summary: hardSummary,
            sources: buildBudgetSources(systemPrompt, compactedHardTail, hardSummary),
            promptHotspots: measureSystemPrompt(hardPrompt)?.hotspots,
            compressionMode: "hard",
            cacheLayout: hardCacheLayout,
          }),
          summary: hardSummary,
          promptMetrics: measureSystemPrompt(hardPrompt),
          cacheLayout: hardCacheLayout,
        };
      }
    }
  }
}

function sliceTailMessages(messages: StoredMessage[], tailCount: number): StoredMessage[] {
  if (messages.length === 0) {
    return [];
  }

  const startIndex = Math.max(0, messages.length - tailCount);
  const safeStartIndex = expandStartToToolBoundary(messages, startIndex);
  return messages.slice(safeStartIndex);
}

function composeChatMessages(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
  model: string,
  provider: string,
): ProviderMessage[] {
  const replayableMessages = normalizeProviderReplayMessages(messages, model, provider);
  return [
    {
      role: "system",
      content: renderSystemPrompt(systemPrompt),
    },
    ...replayableMessages.map((message, index) => ({
      role: message.role,
      content: message.content,
      name: message.name,
      toolCallId: message.tool_call_id,
      toolCalls: message.tool_calls,
      reasoningContent: shouldIncludeStoredAssistantReasoning(replayableMessages, index, model, provider)
        ? message.reasoningContent
        : undefined,
    })),
  ];
}

function normalizeProviderReplayMessages(
  messages: StoredMessage[],
  model: string,
  provider: string,
): StoredMessage[] {
  if (!resolveProviderNeedsReasoningReplay(model, provider)) {
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

function resolveProviderNeedsReasoningReplay(model: string, provider: string): boolean {
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

function compactTailMessages(messages: StoredMessage[], mode: "normal" | "aggressive" | "hard"): StoredMessage[] {
  const protectedRecentCount = mode === "normal" ? DETAILED_RECENT_MESSAGES : mode === "aggressive" ? 4 : 0;
  const protectedStart = Math.max(0, messages.length - protectedRecentCount);

  return messages.map((message, index) => {
    if (index >= protectedStart) {
      return message;
    }

    if (message.role === "tool") {
      return {
        ...message,
        content: truncate(message.content ?? "", mode === "hard" ? 120 : mode === "aggressive" ? 320 : 700),
      };
    }

    if (message.role === "assistant") {
      return {
        ...message,
        content: truncate(message.content ?? "", mode === "hard" ? 120 : mode === "aggressive" ? 300 : 700),
        reasoningContent: mode === "hard" && !message.tool_calls?.length ? undefined : message.reasoningContent,
      };
    }

    if (message.role === "user") {
      return {
        ...message,
        content: truncate(message.content ?? "", mode === "hard" ? 180 : mode === "aggressive" ? 320 : 800),
      };
    }

    return message;
  });
}

function summarizeConversation(messages: StoredMessage[], maxChars: number): string {
  const summaryLines: string[] = [];
  const candidates = pickSummaryCandidates(messages);
  let totalChars = 0;

  for (const message of candidates) {
    const line = summarizeStoredMessage(message);
    if (!line) {
      continue;
    }

    const nextLine = `- ${line}`;
    if (summaryLines.includes(nextLine)) {
      continue;
    }

    const nextChars = totalChars + nextLine.length + 1;
    if (nextChars > maxChars) {
      break;
    }

    summaryLines.push(nextLine);
    totalChars = nextChars;
  }

  if (summaryLines.length === 0) {
    return "No earlier conversation summary was available.";
  }

  return summaryLines.join("\n");
}

function pickSummaryCandidates(messages: StoredMessage[]): StoredMessage[] {
  const recent = messages
    .filter((message) => !(message.role === "user" && isInternalMessage(message)))
    .slice(-MAX_SUMMARY_MESSAGE_COUNT);

  return recent;
}

function summarizeStoredMessage(message: StoredMessage): string {
  if (message.role === "user") {
    return `User asked: ${truncate(oneLine(message.content ?? ""), 240)}`;
  }

  if (message.role === "assistant" && message.tool_calls?.length) {
    const names = message.tool_calls.map((toolCall) => toolCall.function.name).join(", ");
    const content = truncate(oneLine(message.content ?? ""), 140);
    return content
      ? `Assistant planned tools (${names}) and said: ${content}`
      : `Assistant planned tools: ${names}`;
  }

  if (message.role === "assistant") {
    return `Assistant said: ${truncate(oneLine(message.content ?? ""), 220)}`;
  }

  if (message.role === "tool") {
    return `Tool ${message.name ?? "unknown"} returned: ${truncate(oneLine(message.content ?? ""), 220)}`;
  }

  return "";
}

function estimateChatMessagesChars(messages: ProviderMessage[]): number {
  return messages.reduce((total, message) => total + JSON.stringify(message).length, 0);
}

function appendSummary(systemPrompt: string | PromptLayers, summary: string | undefined): string | PromptLayers {
  if (!summary) {
    return systemPrompt;
  }

  if (typeof systemPrompt === "string") {
    return `${systemPrompt}\n\nEarlier conversation summary:\n${summary}`;
  }

  return {
    ...systemPrompt,
    runtimeFactBlocks: [
      ...systemPrompt.runtimeFactBlocks,
      `Earlier conversation summary:\n${summary}`,
    ],
  };
}

function renderSystemPrompt(systemPrompt: string | PromptLayers): string {
  return typeof systemPrompt === "string" ? systemPrompt : renderPromptLayers(systemPrompt);
}

function measureSystemPrompt(systemPrompt: string | PromptLayers): PromptLayerMetrics | undefined {
  return typeof systemPrompt === "string"
    ? measurePromptLayers({
        staticBlocks: [systemPrompt],
        profilePersonaBlocks: [],
        runtimeFactBlocks: [],
      })
    : measurePromptLayers(systemPrompt);
}

function buildBudgetSources(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
  summary?: string,
): ContextBudgetReport["sources"] {
  const systemChars = renderSystemPrompt(systemPrompt).length;
  const conversationChars = estimateStoredMessagesChars(messages);
  return [
    {
      name: "systemPrompt",
      chars: systemChars,
    },
    ...(summary
      ? [{
          name: "conversationSummary" as const,
          chars: summary.length,
        }]
      : []),
    {
      name: summary ? "compactedConversation" : "nearFieldConversation",
      chars: conversationChars,
      messages: messages.length,
    },
  ];
}

function estimateStoredMessagesChars(messages: StoredMessage[]): number {
  return messages.reduce((total, message) => total + JSON.stringify(message).length, 0);
}

function buildCacheLayoutReport(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
): ContextCacheLayoutReport {
  const stablePrefix = renderStablePromptPrefix(systemPrompt);
  const volatileTail = JSON.stringify({
    runtimeFacts: renderVolatileRuntimeFacts(systemPrompt),
    messages: messages.map((message) => ({
    role: message.role,
    name: message.name,
    content: message.content,
    toolCallId: message.tool_call_id,
    toolCalls: message.tool_calls,
    source: message.source,
  })),
  });
  return {
    stablePrefixFingerprint: stableHash(stablePrefix),
    volatileTailFingerprint: stableHash(volatileTail),
    stablePrefixChars: stablePrefix.length,
    volatileTailChars: volatileTail.length,
    stableSources: typeof systemPrompt === "string"
      ? ["systemPrompt"]
      : [
          "staticPrompt",
          "profilePersona",
        ],
    volatileSources: typeof systemPrompt === "string"
      ? ["nearFieldConversation"]
      : ["runtimeFacts", "nearFieldConversation"],
  };
}

function renderStablePromptPrefix(systemPrompt: string | PromptLayers): string {
  if (typeof systemPrompt === "string") {
    return systemPrompt;
  }

  return [
    "Static operating layer:",
    joinBlocks(systemPrompt.staticBlocks),
    "",
    "Profile persona layer:",
    joinBlocks(systemPrompt.profilePersonaBlocks),
  ].join("\n").trim();
}

function renderVolatileRuntimeFacts(systemPrompt: string | PromptLayers): string {
  if (typeof systemPrompt === "string") {
    return "";
  }

  return [
    "Profile runtime facts layer:",
    joinBlocks(systemPrompt.runtimeFactBlocks),
  ].join("\n").trim();
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

