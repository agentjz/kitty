import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export type ProviderWireApi = "responses" | "chat.completions";
export type ProviderApiKind = "openai-sdk" | "openai-compatible" | "deepseek-openai-compatible";
export type ProviderTransport = "standard" | "relay";
export type ReasoningContentReplayPolicy = "never" | "tool-call-required";
export type ModelCacheMode = "prompt-cache-key" | "provider-automatic" | "none";
export type ChatReasoningRequestMode =
  | "none"
  | "deepseek-thinking"
  | "nvidia-reasoning-effort"
  | "reasoning-effort";

export interface ProviderInfo {
  id: string;
  label: string;
  apiKind: ProviderApiKind;
  transport: ProviderTransport;
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
    maxOutputTokensParam: "max_tokens" | "max_completion_tokens" | "max_output_tokens";
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
const RELAY_REQUEST_TIMEOUT_MS = 15 * 60 * 1000;
const RELAY_DOCTOR_PROBE_TIMEOUT_MS = 45_000;

export const PROVIDER_CATALOG: readonly ProviderInfo[] = [
  {
    id: "deepseek",
    label: "DeepSeek official",
    apiKind: "deepseek-openai-compatible",
    transport: "standard",
    defaultBaseUrl: "https://api.deepseek.com",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "yls",
    label: "YLS Codex",
    apiKind: "openai-sdk",
    transport: "relay",
    defaultBaseUrl: "https://code.ylsagi.com/codex",
    requestTimeoutMs: RELAY_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: RELAY_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "ttapi",
    label: "TTAPI",
    apiKind: "openai-sdk",
    transport: "relay",
    defaultBaseUrl: "https://w.ciykj.cn",
    requestTimeoutMs: RELAY_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: RELAY_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "openai",
    label: "OpenAI official",
    apiKind: "openai-sdk",
    transport: "standard",
    defaultBaseUrl: "https://api.openai.com/v1",
    requestTimeoutMs: RELAY_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: RELAY_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "openai-compatible",
    label: "OpenAI-compatible",
    apiKind: "openai-compatible",
    transport: "standard",
    defaultBaseUrl: "",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "nvidia",
    label: "NVIDIA NIM",
    apiKind: "openai-compatible",
    transport: "standard",
    defaultBaseUrl: "https://integrate.api.nvidia.com/v1",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "groq",
    label: "Groq",
    apiKind: "openai-compatible",
    transport: "standard",
    defaultBaseUrl: "https://api.groq.com/openai/v1",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "cerebras",
    label: "Cerebras",
    apiKind: "openai-compatible",
    transport: "standard",
    defaultBaseUrl: "https://api.cerebras.ai/v1",
    requestTimeoutMs: DEFAULT_REQUEST_TIMEOUT_MS,
    doctorProbeTimeoutMs: DEFAULT_DOCTOR_PROBE_TIMEOUT_MS,
  },
  {
    id: "gemini",
    label: "Google Gemini OpenAI-compatible",
    apiKind: "openai-compatible",
    transport: "standard",
    defaultBaseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
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
    context: 128_000,
    output: 8_000,
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

const NVIDIA_DEEPSEEK_MODEL_BASE = {
  ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  capabilities: {
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE.capabilities,
    reasoning: true,
  },
  request: {
    thinkingDefault: "enabled" as const,
    reasoningEffortDefault: "high" as const,
    maxOutputTokensParam: "max_tokens" as const,
    chat: {
      reasoning: "nvidia-reasoning-effort" as const,
      toolChoice: "auto" as const,
      streamUsage: "include_usage" as const,
    },
  },
};

const REASONING_EFFORT_CHAT_MODEL_BASE = {
  ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE,
  capabilities: {
    ...OPENAI_COMPATIBLE_CHAT_MODEL_BASE.capabilities,
    reasoning: true,
  },
  request: {
    thinkingDefault: "disabled" as const,
    reasoningEffortDefault: "medium" as const,
    maxOutputTokensParam: "max_completion_tokens" as const,
    chat: {
      reasoning: "reasoning-effort" as const,
      toolChoice: "auto" as const,
      streamUsage: "include_usage" as const,
    },
  },
};

const GPT_RESPONSES_MODEL_BASE = {
  wireApi: "responses" as const,
  capabilities: {
    tools: true,
    reasoning: true,
    reasoningContentReplay: "never" as const,
    streaming: true,
    usage: true,
    cache: "prompt-cache-key" as const,
  },
  request: {
    thinkingDefault: "enabled" as const,
    reasoningEffortDefault: "high" as const,
    maxOutputTokensParam: "max_output_tokens" as const,
  },
  limit: {
    context: 400_000,
    output: 128_000,
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
    id: "gpt-5.5",
    providerId: "yls",
    label: "GPT-5.5 via YLS",
    ...GPT_RESPONSES_MODEL_BASE,
  },
  {
    id: "gpt-5.4",
    providerId: "yls",
    label: "GPT-5.4 via YLS",
    ...GPT_RESPONSES_MODEL_BASE,
    request: {
      ...GPT_RESPONSES_MODEL_BASE.request,
      reasoningEffortDefault: "xhigh",
    },
  },
  {
    id: "gpt-5.4",
    providerId: "ttapi",
    label: "GPT-5.4 via TTAPI",
    ...GPT_RESPONSES_MODEL_BASE,
    request: {
      ...GPT_RESPONSES_MODEL_BASE.request,
      thinkingDefault: "disabled",
      reasoningEffortDefault: "xhigh",
    },
  },
  {
    id: "gpt-5.5",
    providerId: "openai",
    label: "GPT-5.5",
    ...GPT_RESPONSES_MODEL_BASE,
  },
  {
    id: "gpt-5.4",
    providerId: "openai",
    label: "GPT-5.4",
    ...GPT_RESPONSES_MODEL_BASE,
    request: {
      ...GPT_RESPONSES_MODEL_BASE.request,
      reasoningEffortDefault: "xhigh",
    },
  },
  {
    id: "deepseek-ai/deepseek-v4-flash",
    providerId: "nvidia",
    label: "DeepSeek V4 Flash via NVIDIA NIM",
    ...NVIDIA_DEEPSEEK_MODEL_BASE,
  },
  {
    id: "openai/gpt-oss-120b",
    providerId: "groq",
    label: "GPT-OSS 120B via Groq",
    ...REASONING_EFFORT_CHAT_MODEL_BASE,
    limit: {
      context: 131_072,
      output: 8_192,
    },
  },
  {
    id: "gpt-oss-120b",
    providerId: "cerebras",
    label: "GPT-OSS 120B via Cerebras",
    ...REASONING_EFFORT_CHAT_MODEL_BASE,
    limit: {
      context: 131_072,
      output: 16_384,
    },
  },
  {
    id: "gemini-2.5-flash",
    providerId: "gemini",
    label: "Gemini 2.5 Flash",
    ...REASONING_EFFORT_CHAT_MODEL_BASE,
    request: {
      ...REASONING_EFFORT_CHAT_MODEL_BASE.request,
      maxOutputTokensParam: "max_tokens",
    },
    limit: {
      context: 1_000_000,
      output: 65_536,
    },
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
