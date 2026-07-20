import type { ProviderCapabilities } from "./capabilities.js";
import type { ProviderMessage } from "./contract.js";

export interface ChatRequestDialectInput {
  messages: ProviderMessage[];
  thinking?: "enabled" | "disabled";
  forceReasoning: boolean;
  reasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}

export function applyChatRequestDialect(
  body: Record<string, unknown>,
  input: ChatRequestDialectInput,
  capabilities: ProviderCapabilities,
): void {
  switch (capabilities.chat.reasoning) {
    case "deepseek-thinking": {
      const thinking = resolveDeepSeekThinking(input.messages, input.thinking ?? "enabled");
      body.thinking = { type: thinking };
      if (thinking === "enabled") {
        body.reasoning_effort = normalizeDeepSeekReasoningEffort(
          input.reasoningEffort ?? capabilities.defaultReasoningEffort,
        );
      }
      break;
    }
    case "agnes-thinking":
      body.chat_template_kwargs = {
        enable_thinking: resolveAgnesThinking({
          thinking: input.thinking,
          forceReasoning: input.forceReasoning,
          defaultReasoningEnabled: capabilities.defaultReasoningEnabled,
        }),
      };
      break;
    case "zhipu-thinking": {
      const thinking = input.thinking ?? (capabilities.defaultReasoningEnabled ? "enabled" : "disabled");
      assertReasoningReplayAvailable(input.messages, thinking, "Zhipu");
      body.thinking = thinking === "enabled"
        ? { type: "enabled", clear_thinking: false }
        : { type: "disabled" };
      if (thinking === "enabled" && capabilities.defaultReasoningEffort) {
        body.reasoning_effort = input.reasoningEffort ?? capabilities.defaultReasoningEffort;
      }
      break;
    }
    case "none":
      break;
  }
}

function resolveDeepSeekThinking(
  messages: ProviderMessage[],
  requested: "enabled" | "disabled",
): "enabled" | "disabled" {
  if (requested === "disabled") {
    return "disabled";
  }

  assertReasoningReplayAvailable(messages, requested, "DeepSeek");

  return "enabled";
}

function assertReasoningReplayAvailable(
  messages: ProviderMessage[],
  thinking: "enabled" | "disabled",
  provider: string,
): void {
  if (thinking === "enabled" && hasUnreplayableAssistantReasoning(messages)) {
    throw new Error(`${provider} thinking tool-call replay requires stored reasoning_content. Start a new turn or disable KITTY_THINKING.`);
  }
}

function hasUnreplayableAssistantReasoning(messages: ProviderMessage[]): boolean {
  return messages.some((message) =>
    message.role === "assistant" &&
    Array.isArray(message.toolCalls) &&
    message.toolCalls.length > 0 &&
    message.reasoningContent === undefined,
  );
}

function normalizeDeepSeekReasoningEffort(
  effort: "minimal" | "low" | "medium" | "high" | "xhigh" | "max" | undefined,
): "high" | "max" {
  if (effort === undefined || effort === "minimal" || effort === "low" || effort === "medium" || effort === "high") {
    return "high";
  }

  if (effort === "xhigh" || effort === "max") {
    return "max";
  }

  return "high";
}

function resolveAgnesThinking(input: {
  thinking?: "enabled" | "disabled";
  forceReasoning: boolean;
  defaultReasoningEnabled: boolean;
}): boolean {
  if (input.thinking === "disabled") {
    return false;
  }

  return input.thinking === "enabled" || input.forceReasoning || input.defaultReasoningEnabled;
}
