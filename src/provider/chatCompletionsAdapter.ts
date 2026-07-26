import type OpenAI from "openai";
import type {
  ChatCompletionMessageFunctionToolCall,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";

import { collapseContentParts, readReasoningContent } from "../session/messages.js";
import { buildProviderRequestBody } from "./chatRequestBody.js";
import type { ProviderCapabilities } from "./capabilities.js";
import { resolveModelProfile } from "./catalog.js";
import type { ProviderAdapterRequest, ProviderMessage, ProviderWireAdapter } from "./contract.js";
import type { ProviderUsageSnapshot } from "./metrics.js";
import { normalizeProviderUsage } from "./usageNormalizer.js";
import { createAbortError, throwIfAborted } from "../utils/abort.js";
import {
  appendToolCallArguments,
  createToolCallProgressReporter,
  type StreamingToolCallState,
} from "./toolCallProgress.js";
import {
  readToolCallProviderMetadata,
  toChatCompletionToolCall,
} from "./toolCallMetadata.js";

export const chatCompletionsAdapter: ProviderWireAdapter = {
  wireApi: "chat.completions",
  async fetchStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Streaming request aborted");
    try {
      const stream = await client.chat.completions.create(
        buildProviderRequestBody({
          provider: request.provider,
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          stream: true,
          forceReasoning: request.forceReasoning,
          thinking: request.thinking,
          reasoningEffort: request.reasoningEffort,
          maxOutputTokens: request.maxOutputTokens,
          capabilities: request.capabilities,
        }) as never,
        { signal: request.abortSignal },
      );

      if (request.abortSignal?.aborted) {
        abortStream(stream as { controller?: AbortController });
        throw createAbortError("Streaming aborted");
      }

      let content = "";
      let reasoningContent = "";
      const toolCallParts = new Map<number, StreamingToolCallState>();
      const toolCallProgress = createToolCallProgressReporter(request.callbacks);

      for await (const chunk of stream as unknown as AsyncIterable<{
        usage?: unknown;
        choices?: Array<{
          delta?: {
            content?: string | null;
            reasoning_content?: string | null;
            tool_calls?: Array<{
              index?: number;
              id?: string;
              extra_content?: unknown;
              function?: {
                name?: string;
                arguments?: string;
              };
            }>;
          };
        }>;
      }>) {
        if (request.abortSignal?.aborted) {
          abortStream(stream as { controller?: AbortController });
          throw createAbortError("Streaming aborted");
        }

        usage = normalizeProviderUsage(chunk.usage) ?? usage;
        const delta = chunk.choices?.[0]?.delta;
        if (!delta) {
          continue;
        }

        if (typeof delta.content === "string" && delta.content.length > 0) {
          content += delta.content;
          request.callbacks?.onAssistantDelta?.(delta.content);
        }

        const reasoningDelta = readChatReasoningContent(delta);
        if (reasoningDelta) {
          reasoningContent += reasoningDelta;
          request.callbacks?.onReasoningDelta?.(reasoningDelta);
        }

        if (Array.isArray(delta.tool_calls)) {
          for (const toolCall of delta.tool_calls) {
            const index = typeof toolCall.index === "number" ? toolCall.index : 0;
            const existing = toolCallParts.get(index) ?? {
              id: toolCall.id ?? `tool-${index}`,
              name: "",
              arguments: "",
              argumentBytesReceived: 0,
            };

            if (toolCall.id) {
              existing.id = toolCall.id;
            }

            if (toolCall.function?.name) {
              existing.name += toolCall.function.name;
            }

            if (toolCall.function?.arguments) {
              appendToolCallArguments(existing, toolCall.function.arguments);
            }

            const providerMetadata = readToolCallProviderMetadata(toolCall.extra_content);
            if (providerMetadata) {
              existing.providerMetadata = providerMetadata;
            }

            toolCallParts.set(index, existing);
            toolCallProgress.report(index, existing);
          }
        }
      }

      for (const [index, toolCall] of toolCallParts) {
        toolCallProgress.report(index, toolCall);
      }

      return {
        content: content.length > 0 ? content : null,
        reasoningContent: resolveToolCallReasoningContent({
          provider: request.provider,
          model: request.model,
          thinking: request.thinking,
          reasoningContent,
          toolCallCount: toolCallParts.size,
          capabilities: request.capabilities,
        }),
        streamedAssistantContent: content.length > 0,
        streamedReasoningContent: reasoningContent.length > 0,
        toolCalls: [...toolCallParts.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([, toolCall]) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
            },
            providerMetadata: toolCall.providerMetadata,
          })),
      };
    } finally {
      request.onRequestMetric?.({
        durationMs: Date.now() - startedAt,
        usage,
      });
    }
  },
  async fetchNonStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Request aborted");
    try {
      const completion = await client.chat.completions.create(
        buildProviderRequestBody({
          provider: request.provider,
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          stream: false,
          forceReasoning: request.forceReasoning,
          thinking: request.thinking,
          reasoningEffort: request.reasoningEffort,
          maxOutputTokens: request.maxOutputTokens,
          capabilities: request.capabilities,
        }) as never,
        { signal: request.abortSignal },
      );
      usage = normalizeProviderUsage((completion as { usage?: unknown }).usage);

      const message = completion.choices[0]?.message;
      if (!message) {
        throw new Error("API returned no message.");
      }

      return {
        content:
          typeof message.content === "string" ? message.content : collapseContentParts(message.content),
        reasoningContent: resolveToolCallReasoningContent({
          provider: request.provider,
          model: request.model,
          thinking: request.thinking,
          reasoningContent: readChatReasoningContent(message),
          toolCallCount: message.tool_calls?.length ?? 0,
          capabilities: request.capabilities,
        }),
        streamedAssistantContent: false,
        streamedReasoningContent: false,
        toolCalls: (message.tool_calls ?? [])
          .filter((call): call is ChatCompletionMessageFunctionToolCall => call.type === "function")
          .map((call) => ({
            id: call.id,
            type: "function",
            providerMetadata: readToolCallProviderMetadata(
              (call as unknown as { extra_content?: unknown }).extra_content,
            ),
            function: {
              name: call.function.name,
              arguments: call.function.arguments,
            },
          })),
      };
    } finally {
      request.onRequestMetric?.({
        durationMs: Date.now() - startedAt,
        usage,
      });
    }
  },
};

function resolveToolCallReasoningContent(input: {
  provider: string;
  model: string;
  thinking?: "enabled" | "disabled";
  reasoningContent: string | undefined;
  toolCallCount: number;
  capabilities?: ProviderCapabilities;
}): string | undefined {
  if (
    shouldReplayReasoningContent(input) &&
    input.thinking !== "disabled" &&
    input.toolCallCount > 0
  ) {
    return input.reasoningContent ?? "";
  }

  return input.reasoningContent && input.reasoningContent.length > 0
    ? input.reasoningContent
    : undefined;
}

function shouldReplayReasoningContent(input: {
  provider: string;
  model: string;
  capabilities?: ProviderCapabilities;
}): boolean {
  if (input.capabilities) {
    return input.capabilities.supportsReasoningContent;
  }

  return resolveModelProfile({
    provider: input.provider,
    model: input.model,
  }).model.capabilities.reasoningContentReplay === "tool-call-required";
}

function readChatReasoningContent(message: unknown): string | undefined {
  return readReasoningContent(message) ??
    readStringProperty(message, "reasoning") ??
    readStringProperty(message, "reasoning_text");
}

function readStringProperty(value: unknown, key: string): string | undefined {
  const candidate = (value as Record<string, unknown> | undefined)?.[key];
  return typeof candidate === "string" && candidate.length > 0 ? candidate : undefined;
}

function abortStream(stream: { controller?: AbortController } | undefined): void {
  try {
    stream?.controller?.abort();
  } catch {
    // best-effort abort
  }
}

export function toChatCompletionMessages(
  messages: ProviderMessage[],
  profileInput: {
    provider?: string;
    model: string;
  },
): ChatCompletionMessageParam[] {
  const profile = resolveModelProfile(profileInput);
  const replayReasoningContent = profile.model.capabilities.reasoningContentReplay === "tool-call-required";
  const replayProviderMetadata = profile.model.capabilities.toolCallProviderMetadataReplay;

  return messages.map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content ?? "",
        tool_call_id: message.toolCallId ?? "",
      };
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      const assistantMessage: Record<string, unknown> = {
        role: "assistant",
        content: message.content ?? "",
        tool_calls: message.toolCalls.map((toolCall) =>
          toChatCompletionToolCall(toolCall, replayProviderMetadata)),
      };

      if (replayReasoningContent && message.reasoningContent !== undefined) {
        assistantMessage.reasoning_content = message.reasoningContent;
      }

      return assistantMessage as unknown as ChatCompletionMessageParam;
    }

    const baseMessage: Record<string, unknown> = {
      role: message.role,
      content: message.content ?? "",
      name: message.name,
    };

    if (message.role === "assistant" && replayReasoningContent && message.reasoningContent !== undefined) {
      baseMessage.reasoning_content = message.reasoningContent;
    }

    return baseMessage as unknown as ChatCompletionMessageParam;
  });
}
