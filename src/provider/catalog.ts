import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export type ProviderWireApi = "chat.completions";
export type ProviderApiKind = "openai-compatible" | "deepseek-openai-compatible";
export type ProviderErrorPolicy = "generic" | "google" | "zhipu";
export type ReasoningContentReplayPolicy = "never" | "tool-call-required";
export type ToolCallProviderMetadataReplayPolicy = "never" | "google-thought-signature-required";
export type ModelCacheMode = "provider-automatic" | "none";
export type ChatReasoningRequestMode =
  | "none"
  | "standard-thinking"
  | "deepseek-thinking"
  | "agnes-thinking"
  | "gemini-thinking"
  | "zhipu-thinking";
export type ChatToolSchemaDialect = "standard" | "gemini";

export interface ProviderInfo {
  id: string;
  label: string;
  apiKind: ProviderApiKind;
  errorPolicy: ProviderErrorPolicy;
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
    toolCallProviderMetadataReplay: ToolCallProviderMetadataReplayPolicy;
    streaming: boolean;
    streamingTools: boolean;
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
      toolSchema: ChatToolSchemaDialect;
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
    errorPolicy: "generic",
    defaultBaseUrl: "https://api.deepseek.com",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "agnes",
    label: "Agnes AI",
    apiKind: "openai-compatible",
    errorPolicy: "generic",
    defaultBaseUrl: "https://apihub.agnes-ai.com/v1",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "zhipu",
    label: "Zhipu AI",
    apiKind: "openai-compatible",
    errorPolicy: "zhipu",
    defaultBaseUrl: "https://open.bigmodel.cn/api/paas/v4",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "google",
    label: "Google Gemini",
    apiKind: "openai-compatible",
    errorPolicy: "google",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    apiKind: "openai-compatible",
    errorPolicy: "generic",
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
    toolCallProviderMetadataReplay: "never" as const,
    streaming: true,
    streamingTools: true,
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
      toolSchema: "standard" as const,
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
    toolCallProviderMetadataReplay: "never" as const,
    streaming: true,
    streamingTools: true,
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
      toolSchema: "standard" as const,
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
      toolSchema: "standard" as const,
    },
  },
  limit: {
    context: 512_000,
    output: 65_500,
  },
};

const ZHIPU_MODEL_BASE = {
  ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  capabilities: {
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE.capabilities,
    reasoning: true,
    reasoningContentReplay: "tool-call-required" as const,
    cache: "provider-automatic" as const,
  },
  request: {
    thinkingDefault: "enabled" as const,
    maxOutputTokensParam: "max_tokens" as const,
    chat: {
      reasoning: "zhipu-thinking" as const,
      toolChoice: "auto" as const,
      streamUsage: "include_usage" as const,
      toolSchema: "standard" as const,
    },
  },
  limit: {
    context: 200_000,
    output: 131_072,
  },
};

const GEMINI_MODEL_BASE = {
  ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  capabilities: {
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE.capabilities,
    reasoning: true,
    toolCallProviderMetadataReplay: "google-thought-signature-required" as const,
    cache: "provider-automatic" as const,
  },
  request: {
    thinkingDefault: "enabled" as const,
    reasoningEffortDefault: "medium" as const,
    maxOutputTokensParam: "max_tokens" as const,
    chat: {
      reasoning: "gemini-thinking" as const,
      toolChoice: "auto" as const,
      streamUsage: "include_usage" as const,
      toolSchema: "gemini" as const,
    },
  },
  limit: {
    context: 1_048_576,
    output: 65_536,
  },
};

function createZhipuModel(input: {
  id: string;
  label: string;
  context: number;
  reasoningEffortDefault?: ModelReasoningEffort;
}): ModelInfo {
  return {
    id: input.id,
    providerId: "zhipu",
    label: input.label,
    ...ZHIPU_MODEL_BASE,
    request: {
      ...ZHIPU_MODEL_BASE.request,
      reasoningEffortDefault: input.reasoningEffortDefault,
    },
    limit: {
      context: input.context,
      output: 131_072,
    },
  };
}

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
  {
    id: "agnes-2.5-flash",
    providerId: "agnes",
    label: "Agnes 2.5 Flash",
    ...AGNES_MODEL_BASE,
  },
  {
    id: "gemini-3.5-flash",
    providerId: "google",
    label: "Gemini 3.5 Flash",
    ...GEMINI_MODEL_BASE,
  },
  createZhipuModel({ id: "glm-4.7-flash", label: "GLM-4.7 Flash", context: 200_000 }),
  createZhipuModel({ id: "glm-4.6", label: "GLM-4.6", context: 200_000 }),
  createZhipuModel({ id: "glm-4.7", label: "GLM-4.7", context: 200_000 }),
  createZhipuModel({ id: "glm-5", label: "GLM-5", context: 200_000 }),
  createZhipuModel({ id: "glm-5-turbo", label: "GLM-5 Turbo", context: 200_000 }),
  createZhipuModel({ id: "glm-5.1", label: "GLM-5.1", context: 200_000 }),
  createZhipuModel({
    id: "glm-5.2",
    label: "GLM-5.2",
    context: 1_000_000,
    reasoningEffortDefault: "max",
  }),
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
    return createOpenAiCompatibleModelInfo(normalizedProvider, normalizedModel);
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

function createOpenAiCompatibleModelInfo(providerId: string, modelId: string): ModelInfo {
  return {
    id: modelId,
    providerId,
    label: modelId,
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  };
}
