import type { FunctionToolDefinition } from "../tools/index.js";
import { resolveProviderCachePolicy } from "./cachePolicy.js";
import { resolveProviderCapabilities } from "./capabilities.js";
import type { ProviderMessage } from "./contract.js";
import { applyChatRequestDialect } from "./chatRequestDialect.js";
import { toChatCompletionMessages } from "./chatCompletionsAdapter.js";
import { normalizeProviderMaxOutputTokens } from "./maxOutputTokens.js";

export interface BuildProviderRequestBodyInput {
  provider?: string;
  model: string;
  messages: ProviderMessage[];
  tools: FunctionToolDefinition[] | undefined;
  stream: boolean;
  forceReasoning: boolean;
  thinking?: "enabled" | "disabled";
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
  maxOutputTokens?: number;
  sessionId?: string;
  projectRoot?: string;
}

export function buildProviderRequestBody(
  input: BuildProviderRequestBodyInput,
): Record<string, unknown> {
  const capabilities = resolveProviderCapabilities(input);
  const body: Record<string, unknown> = {
    model: input.model,
    messages: toChatCompletionMessages(input.messages, {
      provider: input.provider,
      model: input.model,
    }),
    tools: input.tools,
    stream: input.stream,
  };

  if (input.tools?.length && capabilities.chat.toolChoice === "auto") {
    body.tool_choice = "auto";
  }

  if (input.stream && capabilities.chat.streamUsage === "include_usage") {
    body.stream_options = {
      include_usage: true,
    };
  }

  const cachePolicy = resolveProviderCachePolicy(input);
  if (cachePolicy.promptCacheKey) {
    body.prompt_cache_key = cachePolicy.promptCacheKey;
  }

  if (typeof input.maxOutputTokens === "number" && Number.isFinite(input.maxOutputTokens)) {
    body[capabilities.maxOutputTokensParam] = normalizeProviderMaxOutputTokens(
      input.maxOutputTokens,
      capabilities.maxOutputTokensLimit,
    );
  }

  applyChatRequestDialect(body, input, capabilities);

  return body;
}
