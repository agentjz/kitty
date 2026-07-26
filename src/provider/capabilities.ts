import {
  resolveModelProfile,
  type ChatReasoningRequestMode,
  type ProviderErrorPolicy,
  type ToolCallProviderMetadataReplayPolicy,
} from "./catalog.js";
import type { ModelReasoningEffort } from "../types.js";

export interface ProviderCapabilities {
  provider: string;
  model: string;
  wireApi: "chat.completions";
  errorPolicy: ProviderErrorPolicy;
  supportsTools: boolean;
  supportsStreamingTools: boolean;
  supportsReasoningContent: boolean;
  toolCallProviderMetadataReplay: ToolCallProviderMetadataReplayPolicy;
  defaultReasoningEnabled: boolean;
  defaultReasoningEffort?: ModelReasoningEffort;
  reasoningEfforts?: ModelReasoningEffort[];
  maxOutputTokensParam: "max_tokens" | "max_completion_tokens" | "max_output_tokens";
  maxOutputTokensLimit: number;
  chat: {
    reasoning: ChatReasoningRequestMode;
    toolChoice: "auto" | "omit";
    streamUsage: "include_usage" | "omit";
    toolSchema: "standard" | "gemini";
  };
  requestTimeoutMs: number;
  doctorProbeTimeoutMs: number;
}

interface ProviderProfileInput {
  provider?: string;
  model: string;
}

export function resolveProviderCapabilities(input: ProviderProfileInput): ProviderCapabilities {
  const profile = resolveModelProfile(input);
  return {
    provider: profile.provider.id,
    model: profile.model.id,
    wireApi: profile.model.wireApi,
    errorPolicy: profile.provider.errorPolicy,
    supportsTools: profile.model.capabilities.tools,
    supportsStreamingTools: profile.model.capabilities.streamingTools,
    supportsReasoningContent: profile.model.capabilities.reasoningContentReplay !== "never",
    toolCallProviderMetadataReplay: profile.model.capabilities.toolCallProviderMetadataReplay,
    defaultReasoningEnabled: profile.model.capabilities.reasoning,
    defaultReasoningEffort: profile.model.request.reasoningEffortDefault,
    maxOutputTokensParam: profile.model.request.maxOutputTokensParam,
    maxOutputTokensLimit: profile.model.limit.output,
    chat: profile.model.request.chat ?? {
      reasoning: "none",
      toolChoice: "auto",
      streamUsage: "include_usage",
      toolSchema: "standard",
    },
    requestTimeoutMs: profile.provider.requestTimeoutMs,
    doctorProbeTimeoutMs: profile.provider.doctorProbeTimeoutMs,
  };
}
