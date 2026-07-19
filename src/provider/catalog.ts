import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export type ProviderWireApi = "chat.completions";
export type ProviderApiKind = "openai-compatible" | "deepseek-openai-compatible";
export type ReasoningContentReplayPolicy = "never" | "tool-call-required";
export type ModelCacheMode = "provider-automatic" | "none";
export type ChatReasoningRequestMode =
  | "none"
  | "deepseek-thinking"
  | "agnes-thinking";

export interface ProviderInfo {
  id: string;
  label: string;
  apiKind: ProviderApiKind;
  defaultBaseUrl: string;
  requestTimeoutMs: number;
  doctorProbeTimeoutMs: number;
}

export interface ModelInfo {
  id: string;
  providerId: string;
  label: string;
  wireApi: ProviderWireApi;
  capabilities: {
    tools: boolean;
    reasoning: boolean;
    reasoningContentReplay: ReasoningContentReplayPolicy;
    streaming: boolean;
    usage: boolean;
    cache: ModelCacheMode;
  };
  request: {
    thinkingDefault?: ModelThinkingMode;
    reasoningEffortDefault?: ModelReasoningEffort;
    maxOutputTokensParam: "max_tokens";
    chat?: {
      reasoning: ChatReasoningRequestMode;
      toolChoice: "auto" | "omit";
      streamUsage: "include_usage" | "omit";
    };
  };
  limit: {
    context: number;
    output: number;
  };
  cost?: {
    input: number;
    output: number;
    cacheRead?: number;
    cacheWrite?: number;
  };
}

export interface ResolvedModelProfile {
  provider: ProviderInfo;
  model: ModelInfo;
  configuredProvider: string;
  configuredModel: string;
}

const DEFAULT_REQUEST_TIMEOUT_MS = 10 * 60 * 1000;
const DEFAULT_DOCTOR_PROBE_TIMEOUT_MS = 10_000;

export const PROVIDER_CATALOG: readonly ProviderInfo[] = [
  {
    id: "deepseek",
    label: "DeepSeek official",
    apiKind: "deepseek-openai-compatible",
    defaultBaseUrl: "https://api.deepseek.com",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "agnes",
    label: "Agnes AI",
    apiKind: "openai-compatible",
    defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    apiKind: "openai-compatible",
    defaultBaseUrl: "",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
] as const;

const DEEPSEEK_MODEL_BASE = {
  wireApi: "chat.completions" as const,
  capabilities: {
    tools: true,
    reasoning: true,
    reasoningContentReplay: "tool-call-required" as const,
    streaming: true,
    usage: true,
    cache: "provider-automatic" as const,
  },
  request: {
    thinkingDefault: "enabled" as const,
    reasoningEffortDefault: "max" as const,
    maxOutputTokensParam: "max_tokens" as const,
    chat: {
      reasoning: "deepseek-thinking" as const,
      toolChoice: "omit" as const,
      streamUsage: "include_usage" as const,
    },
  },
  limit: {
    context: 1_000_000,
    output: 384_000,
  },
};

const OPENAI_COMPATIBLE_CHAT_MODEL_BASE = {
  wireApi: "chat.completions" as const,
  capabilities: {
    tools: true,
    reasoning: false,
    reasoningContentReplay: "never" as const,
    streaming: true,
    usage: true,
    cache: "none" as const,
  },
  request: {
    thinkingDefault: "disabled" as const,
    maxOutputTokensParam: "max_tokens" as const,
    chat: {
      reasoning: "none" as const,
      toolChoice: "auto" as const,
      streamUsage: "include_usage" as const,
    },
  },
  limit: {
    context: 128_000,
    output: 8_000,
  },
};

const AGNES_MODEL_BASE = {
  ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  capabilities: {
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE.capabilities,
    reasoning: true,
  },
  request: {
    thinkingDefault: "enabled" as const,
    maxOutputTokensParam: "max_tokens" as const,
    chat: {
      reasoning: "agnes-thinking" as const,
      toolChoice: "auto" as const,
      streamUsage: "include_usage" as const,
    },
  },
  limit: {
    context: 512_000,
    output: 65_500,
  },
};

export const MODEL_CATALOG: readonly ModelInfo[] = [
  {
    id: "deepseek-v4-flash",
    providerId: "deepseek",
    label: "DeepSeek V4 Flash",
    ...DEEPSEEK_MODEL_BASE,
  },
  {
    id: "deepseek-v4-pro",
    providerId: "deepseek",
    label: "DeepSeek V4 Pro",
    ...DEEPSEEK_MODEL_BASE,
  },
  {
    id: "agnes-2.0-flash",
    providerId: "agnes",
    label: "Agnes 2.0 Flash",
    ...AGNES_MODEL_BASE,
  },
] as const;

export function listProviderInfos(): ProviderInfo[] {
  return [...PROVIDER_CATALOG];
}

export function listModelInfos(): ModelInfo[] {
  return [...MODEL_CATALOG];
}

export function findProviderInfo(providerId: string | undefined): ProviderInfo | undefined {
  return PROVIDER_CATALOG.find((provider) => provider.id === normalizeProviderId(providerId));
}

export function findModelInfo(providerId: string | undefined, modelId: string): ModelInfo | undefined {
  const normalizedProvider = normalizeProviderId(providerId);
  const normalizedModel = normalizeModelId(modelId);
  const known = MODEL_CATALOG.find((model) =>
    model.providerId === normalizedProvider && model.id === normalizedModel);
  if (known) {
    return known;
  }

  if (normalizedProvider === "openai-compatible") {
    return createOpenAiCompatibleModelInfo(normalizedModel);
  }

  return undefined;
}

export function resolveModelProfile(input: {
  provider?: string;
  model: string;
}): ResolvedModelProfile {
  const configuredProvider = normalizeProviderId(input.provider);
  const configuredModel = normalizeModelId(input.model);
  const provider = findProviderInfo(configuredProvider);
  if (!provider) {
    throw new Error(`Unknown provider: ${configuredProvider}. Check KITTY_PROVIDER.`);
  }

  const model = findModelInfo(configuredProvider, configuredModel);
  if (!model) {
    throw new Error(`Unknown model for provider ${configuredProvider}: ${configuredModel}. Check KITTY_MODEL.`);
  }

  return {
    provider,
    model,
    configuredProvider,
    configuredModel,
  };
}

export function normalizeProviderId(value: string | undefined): string {
  const normalized = String(value ?? "").trim().toLowerCase();
  return normalized || "openai-compatible";
}

export function normalizeModelId(value: string): string {
  return String(value ?? "").trim();
}

function createOpenAiCompatibleModelInfo(modelId: string): ModelInfo {
  return {
    id: modelId,
    providerId: "openai-compatible",
    label: modelId,
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  };
}
