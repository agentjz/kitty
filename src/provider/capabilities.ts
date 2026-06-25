import { resolveModelProfile } from "./catalog.js";

export interface ProviderCapabilities {
  provider: string;
  model: string;
  wireApi: "responses" | "chat.completions";
  supportsReasoningContent: boolean;
  defaultReasoningEnabled: boolean;
  defaultReasoningEffort?: "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
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
    supportsReasoningContent: profile.model.capabilities.reasoningContentReplay !== "never",
    defaultReasoningEnabled: profile.model.capabilities.reasoning,
    defaultReasoningEffort: profile.model.request.reasoningEffortDefault,
    requestTimeoutMs: profile.provider.requestTimeoutMs,
    doctorProbeTimeoutMs: profile.provider.doctorProbeTimeoutMs,
  };
}
