import type OpenAI from "openai";

import type { ProviderUsageSnapshot } from "./metrics.js";
import type { ProviderAdapterRequest, ProviderWireAdapter } from "./contract.js";
import { normalizeProviderUsage } from "./usageNormalizer.js";
import { createAbortError, throwIfAborted } from "../utils/abort.js";
import { buildResponsesRequestBody } from "./responsesRequest.js";
import {
  normalizeResponsesOutputText,
  readResponsesReasoning,
  readResponsesToolCalls,
} from "./responsesResponse.js";
import {
  appendToolCallArguments,
  createToolCallProgressReporter,
  replaceToolCallArguments,
  type StreamingToolCallState,
} from "./toolCallProgress.js";

export { buildResponsesRequestBody } from "./responsesRequest.js";

export const responsesAdapter: ProviderWireAdapter = {
  wireApi: "responses",
  async fetchStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Streaming request aborted");
    try {
      const stream = await client.responses.create(
        {
          ...buildResponsesRequestBody(request),
          stream: true,
        } as never,
        {
          signal: request.abortSignal,
        },
      );

      if (request.abortSignal?.aborted) {
        abortStream(stream as { controller?: AbortController });
        throw createAbortError("Streaming aborted");
      }

      let content = "";
      let reasoningContent = "";
      const toolCalls = new Map<number, StreamingToolCallState>();
      const toolCallProgress = createToolCallProgressReporter(request.callbacks);

      for await (const event of stream as unknown as AsyncIterable<{
        type?: string;
        delta?: string;
        item_id?: string;
        output_index?: number;
        name?: string;
        arguments?: string;
        item?: {
          id?: string;
          type?: string;
          call_id?: string;
          name?: string;
          arguments?: string;
        };
        response?: {
          usage?: unknown;
        };
      }>) {
        if (request.abortSignal?.aborted) {
          abortStream(stream as { controller?: AbortController });
          throw createAbortError("Streaming aborted");
        }

        usage = normalizeProviderUsage(event.response?.usage) ?? usage;

        if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
          content += event.delta;
          request.callbacks?.onAssistantDelta?.(event.delta);
          continue;
        }

        if (
          (event.type === "response.reasoning_text.delta" || event.type === "response.reasoning_summary_text.delta") &&
          typeof event.delta === "string"
        ) {
          reasoningContent += event.delta;
          request.callbacks?.onReasoningDelta?.(event.delta);
          continue;
        }

        if (event.type === "response.output_item.added" && event.item?.type === "function_call") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          const existing = toolCalls.get(index) ?? {
            id: event.item.call_id ?? event.item.id ?? event.item_id ?? `tool-${index}`,
            name: "",
            arguments: "",
            argumentBytesReceived: 0,
          };
          existing.id = event.item.call_id ?? event.item.id ?? existing.id;
          existing.name = event.item.name ?? existing.name;
          if (typeof event.item.arguments === "string" && event.item.arguments.length > 0) {
            replaceToolCallArguments(existing, event.item.arguments);
          }
          toolCalls.set(index, existing);
          toolCallProgress.report(index, existing);
          continue;
        }

        if (event.type === "response.function_call_arguments.delta" && typeof event.delta === "string") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          const existing = toolCalls.get(index) ?? {
            id: event.item_id ?? `tool-${index}`,
            name: "",
            arguments: "",
            argumentBytesReceived: 0,
          };
          appendToolCallArguments(existing, event.delta);
          toolCalls.set(index, existing);
          toolCallProgress.report(index, existing);
          continue;
        }

        if (event.type === "response.function_call_arguments.done") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          const existing = toolCalls.get(index) ?? {
            id: event.item_id ?? `tool-${index}`,
            name: "",
            arguments: "",
            argumentBytesReceived: 0,
          };
          if (typeof event.name === "string") {
            existing.name = event.name;
          }
          if (typeof event.arguments === "string" && event.arguments.length > 0) {
            replaceToolCallArguments(existing, event.arguments);
          }
          toolCalls.set(index, existing);
          toolCallProgress.report(index, existing);
          continue;
        }

        if (event.type === "response.output_item.done" && event.item?.type === "function_call") {
          const index = typeof event.output_index === "number" ? event.output_index : 0;
          const existing = toolCalls.get(index) ?? {
            id: event.item.call_id ?? event.item.id ?? `tool-${index}`,
            name: "",
            arguments: "",
            argumentBytesReceived: 0,
          };
          existing.id = event.item.call_id ?? event.item.id ?? existing.id;
          existing.name = event.item.name ?? existing.name;
          if (typeof event.item.arguments === "string") {
            replaceToolCallArguments(existing, event.item.arguments);
          }
          toolCalls.set(index, existing);
          toolCallProgress.report(index, existing);
        }
      }

      for (const [index, toolCall] of toolCalls) {
        toolCallProgress.report(index, toolCall);
      }

      return {
        content: content.length > 0 ? content : null,
        reasoningContent: reasoningContent.length > 0 ? reasoningContent : undefined,
        streamedAssistantContent: content.length > 0,
        streamedReasoningContent: reasoningContent.length > 0,
        toolCalls: [...toolCalls.entries()]
          .sort((left, right) => left[0] - right[0])
          .map(([, toolCall]) => ({
            id: toolCall.id,
            type: "function",
            function: {
              name: toolCall.name,
              arguments: toolCall.arguments,
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
  async fetchNonStreaming(client: OpenAI, request: ProviderAdapterRequest) {
    const startedAt = Date.now();
    let usage: ProviderUsageSnapshot | undefined;
    throwIfAborted(request.abortSignal, "Request aborted");
    try {
      const response = await client.responses.create(
        {
          ...buildResponsesRequestBody(request),
          stream: false,
        } as never,
        {
          signal: request.abortSignal,
        },
      );
      usage = normalizeProviderUsage((response as { usage?: unknown }).usage);

      return {
        content: normalizeResponsesOutputText(response),
        reasoningContent: readResponsesReasoning(response),
        streamedAssistantContent: false,
        streamedReasoningContent: false,
        toolCalls: readResponsesToolCalls(response),
      };
    } finally {
      request.onRequestMetric?.({
        durationMs: Date.now() - startedAt,
        usage,
      });
    }
  },
};

function abortStream(stream: { controller?: AbortController } | undefined): void {
  try {
    stream?.controller?.abort();
  } catch {
    // best-effort abort
  }
}
