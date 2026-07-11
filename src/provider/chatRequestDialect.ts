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
    case "nvidia-reasoning-effort":
      body.reasoning_effort = resolveNvidiaReasoningEffort({
        thinking: input.thinking,
        forceReasoning: input.forceReasoning,
        defaultReasoningEnabled: capabilities.defaultReasoningEnabled,
        effort: input.reasoningEffort ?? capabilities.defaultReasoningEffort,
      });
      break;
    case "agnes-thinking":
      body.chat_template_kwargs = {
        enable_thinking: resolveAgnesThinking({
          thinking: input.thinking,
          forceReasoning: input.forceReasoning,
          defaultReasoningEnabled: capabilities.defaultReasoningEnabled,
        }),
      };
      break;
    case "reasoning-effort": {
      const reasoningEffort = resolveReasoningEffort({
        thinking: input.thinking,
        forceReasoning: input.forceReasoning,
        defaultReasoningEnabled: capabilities.defaultReasoningEnabled,
        effort: input.reasoningEffort ?? capabilities.defaultReasoningEffort,
      });
      if (reasoningEffort) {
        body.reasoning_effort = reasoningEffort;
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

  if (hasUnreplayableAssistantReasoning(messages)) {
    throw new Error("DeepSeek thinking tool-call replay requires stored reasoning_content. Start a new turn or disable KITTY_THINKING.");
  }

  return "enabled";
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

function resolveNvidiaReasoningEffort(input: {
  thinking?: "enabled" | "disabled";
  forceReasoning: boolean;
  defaultReasoningEnabled: boolean;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}): "none" | "high" | "max" {
  if (input.thinking === "disabled") {
    return "none";
  }

  if (!input.forceReasoning && input.thinking !== "enabled" && !input.defaultReasoningEnabled) {
    return "none";
  }

  return input.effort === "xhigh" || input.effort === "max" ? "max" : "high";
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

function resolveReasoningEffort(input: {
  thinking?: "enabled" | "disabled";
  forceReasoning: boolean;
  defaultReasoningEnabled: boolean;
  effort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}): "low" | "medium" | "high" | undefined {
  if (input.thinking === "disabled") {
    return undefined;
  }

  if (!input.forceReasoning && input.thinking !== "enabled" && !input.defaultReasoningEnabled) {
    return undefined;
  }

  if (input.effort === "minimal" || input.effort === "low") {
    return "low";
  }

  if (input.effort === "high" || input.effort === "xhigh" || input.effort === "max") {
    return "high";
  }

  return "medium";
}
