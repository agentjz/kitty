import { expandStartToToolBoundary, shouldIncludeStoredAssistantReasoning } from "../../../session/messages.js";
import { renderPromptLayers } from "../../../agent/prompt/format.js";
import { measurePromptLayers } from "../../../agent/prompt/metrics.js";
import { isInternalMessage } from "../../../session/turnFrame.js";
import { buildVisibleConversationWindow } from "../conversationWindow.js";
import { buildContextBudgetReport } from "../budget.js";
import type { ProviderMessage } from "../../../provider/contract.js";
import type { PromptLayerMetrics, PromptLayers } from "../../../agent/prompt/types.js";
import type { RuntimeConfig, StoredMessage } from "../../../types.js";
import type { ContextBudgetReport } from "../../../types/contextBudget.js";
import type { ContextRuntimeRequest } from "../types.js";

const MIN_TAIL_MESSAGES = 8;
const DETAILED_RECENT_MESSAGES = 8;
const HARD_TAIL_COUNTS = [8, 6, 4, 2, 1];
const MAX_SUMMARY_MESSAGE_COUNT = 48;

export function buildCompressedContextRequest(
  systemPrompt: string | PromptLayers,
  messages: StoredMessage[],
  config: Pick<RuntimeConfig, "contextWindowMessages" | "model" | "maxContextChars" | "contextSummaryChars">,
): ContextRuntimeRequest {
  const safeMaxChars = Math.max(8_000, config.maxContextChars);
  const conversation = buildVisibleConversationWindow(messages);
  const conversationMessages = conversation.messages;
  const fullMessages = composeChatMessages(systemPrompt, conversationMessages, config.model);
  const initialEstimatedChars = estimateChatMessagesChars(fullMessages);
  const initialPromptMetrics = measureSystemPrompt(systemPrompt);
  const initialSources = buildBudgetSources(systemPrompt, conversationMessages);

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
      }),
      promptMetrics: initialPromptMetrics,
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
    let requestMessages = composeChatMessages(summaryPrompt, workingTail, config.model);
    let estimatedChars = estimateChatMessagesChars(requestMessages);
    let promptMetrics = measureSystemPrompt(summaryPrompt);

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
        }),
        summary,
        promptMetrics,
      };
    }

    workingTail = compactTailMessages(tailMessages, "aggressive");
    requestMessages = composeChatMessages(summaryPrompt, workingTail, config.model);
    estimatedChars = estimateChatMessagesChars(requestMessages);
    promptMetrics = measureSystemPrompt(summaryPrompt);

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
        }),
        summary,
        promptMetrics,
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
      );
      const hardEstimatedChars = estimateChatMessagesChars(hardMessages);
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
          }),
          summary: hardSummary,
          promptMetrics: measureSystemPrompt(hardPrompt),
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
): ProviderMessage[] {
  return [
    {
      role: "system",
      content: renderSystemPrompt(systemPrompt),
    },
    ...messages.map((message, index) => ({
      role: message.role,
      content: message.content,
      name: message.name,
      toolCallId: message.tool_call_id,
      toolCalls: message.tool_calls,
      reasoningContent: shouldIncludeStoredAssistantReasoning(messages, index, model)
        ? message.reasoningContent
        : undefined,
    })),
  ];
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
        reasoningContent: mode === "hard" ? undefined : message.reasoningContent,
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
    .filter((message) => !(message.role === "user" && isInternalMessage(message.content)))
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

function oneLine(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }

  return `${value.slice(0, maxChars)}...`;
}

