import { resolveProviderCapabilities } from "./capabilities.js";
import { resolveProviderCachePolicy } from "./cachePolicy.js";
import type { ProviderAdapterRequest, ProviderMessage } from "./contract.js";
import { normalizeProviderMaxOutputTokens } from "./maxOutputTokens.js";

export function buildResponsesRequestBody(request: ProviderAdapterRequest): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities({
    provider: request.provider,
    model: request.model,
  });

  const body: Record<string, unknown> = {
    model: request.model,
    input: toResponsesInput(request.messages),
    tools: request.tools?.map((tool) => ({
      type: "function",
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters ?? null,
      strict: false,
    })),
    tool_choice: request.tools?.length ? "auto" : undefined,
  };

  if (typeof request.maxOutputTokens === "number" && Number.isFinite(request.maxOutputTokens)) {
    body.max_output_tokens = normalizeProviderMaxOutputTokens(
      request.maxOutputTokens,
      capabilities.maxOutputTokensLimit,
    );
  }

  const cachePolicy = resolveProviderCachePolicy({
    provider: request.provider,
    model: request.model,
    sessionId: request.sessionId,
    projectRoot: request.projectRoot,
  });
  if (cachePolicy.promptCacheKey) {
    body.prompt_cache_key = cachePolicy.promptCacheKey;
  }

  const reasoningEffort = request.thinking === "disabled"
    ? undefined
    : normalizeResponsesReasoningEffort(
      request.reasoningEffort ?? capabilities.defaultReasoningEffort,
    );
  if (
    request.thinking !== "disabled" &&
    (request.forceReasoning || capabilities.defaultReasoningEnabled || request.thinking === "enabled" || reasoningEffort)
  ) {
    body.reasoning = {
      effort: reasoningEffort ?? "high",
      summary: "detailed",
    };
  }

  return body;
}

function normalizeResponsesReasoningEffort(
  effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | undefined,
): "minimal" | "low" | "medium" | "high" | "xhigh" | undefined {
  if (effort === "xhigh") {
    return "xhigh";
  }

  return effort === "max" ? undefined : effort;
}

function toResponsesInput(messages: ProviderMessage[]): Array<Record<string, unknown>> {
  const items: Array<Record<string, unknown>> = [];

  for (const message of messages) {
    if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.toolCallId ?? "",
        output: message.content ?? "",
      });
      continue;
    }

    if (message.role === "assistant" && message.toolCalls?.length) {
      if (typeof message.content === "string" && message.content.trim().length > 0) {
        items.push({
          type: "message",
          role: "assistant",
          content: message.content,
        });
      }

      for (const toolCall of message.toolCalls) {
        items.push({
          type: "function_call",
          call_id: toolCall.id,
          name: toolCall.function.name,
          arguments: toolCall.function.arguments,
        });
      }
      continue;
    }

    items.push({
      type: "message",
      role: message.role,
      content: message.content ?? "",
    });
  }

  return items;
}
