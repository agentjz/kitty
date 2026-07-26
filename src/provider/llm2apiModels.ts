import type { ProviderCapabilities } from "./capabilities.js";
import { buildProviderProbeRequest } from "./transport.js";
import type { ModelReasoningEffort } from "../types.js";

interface Llm2apiModelList {
  data?: unknown;
}

interface Llm2apiModel {
  id?: unknown;
  owned_by?: unknown;
  capabilities?: unknown;
}

interface Llm2apiCapabilities {
  streaming?: unknown;
  tools?: unknown;
  reasoning?: unknown;
  usage?: unknown;
  limits?: unknown;
}

export async function fetchLlm2apiModelCapabilities(input: {
  baseUrl: string;
  apiKey: string;
  model: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ProviderCapabilities> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const request = buildProviderProbeRequest({
    baseUrl: input.baseUrl,
    apiKey: input.apiKey,
  });
  const response = await fetchImpl(request.endpoint, {
    method: request.method,
    headers: request.headers,
    signal: AbortSignal.timeout(input.timeoutMs ?? 10_000),
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error("LLM2API model capability discovery failed: downstream API key is not authorized.");
  }
  if (!response.ok) {
    throw new Error(`LLM2API model capability discovery failed: /models returned ${response.status}.`);
  }

  const payload = await response.json().catch(() => undefined) as Llm2apiModelList | undefined;
  const models = Array.isArray(payload?.data) ? payload.data as Llm2apiModel[] : [];
  const model = models.find((item) => item.id === input.model);
  if (!model) {
    throw new Error(`LLM2API model capability discovery failed: model ${input.model} is not exposed by /v1/models for this downstream API key.`);
  }
  if (model.owned_by !== "llm2api") {
    throw new Error(`LLM2API model capability discovery failed: model ${input.model} is not owned_by=llm2api.`);
  }

  return mapLlm2apiCapabilities(input.model, readObject(model.capabilities));
}

export function mapLlm2apiCapabilities(
  model: string,
  capabilities: Record<string, unknown> | undefined,
): ProviderCapabilities {
  const publicCapabilities = (capabilities ?? {}) as Llm2apiCapabilities;
  const tools = readObject(publicCapabilities.tools);
  const reasoning = readObject(publicCapabilities.reasoning);
  const usage = readObject(publicCapabilities.usage);
  const limits = readObject(publicCapabilities.limits);
  const reasoningEfforts = readReasoningEfforts(reasoning?.efforts);
  const reasoningEnabled = readBoolean(reasoning?.enabled) ||
    readBoolean(reasoning?.always_on) ||
    readBoolean(reasoning?.configurable) ||
    reasoningEfforts.length > 0;
  const outputLimit = readPositiveInteger(limits?.output_tokens) ?? 8_000;

  return {
    provider: "llm2api",
    model,
    wireApi: "chat.completions",
    errorPolicy: "generic",
    supportsTools: readBoolean(tools?.function_calling),
    supportsStreamingTools: readBoolean(tools?.streaming_tool_calls),
    supportsReasoningContent: readBoolean(reasoning?.preserve),
    toolCallProviderMetadataReplay: "never",
    defaultReasoningEnabled: readBoolean(reasoning?.default_enabled) || readBoolean(reasoning?.always_on),
    defaultReasoningEffort: reasoningEfforts[0],
    reasoningEfforts,
    maxOutputTokensParam: "max_tokens",
    maxOutputTokensLimit: outputLimit,
    chat: {
      reasoning: reasoningEnabled ? "standard-thinking" : "none",
      toolChoice: readStringArray(tools?.tool_choice).includes("auto") ? "auto" : "omit",
      streamUsage: readBoolean(usage?.stream) ? "include_usage" : "omit",
      toolSchema: "standard",
    },
    requestTimeoutMs: 10 * 60 * 1000,
    doctorProbeTimeoutMs: 10_000,
  };
}

function readObject(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readPositiveInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : undefined;
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function readReasoningEfforts(value: unknown): ModelReasoningEffort[] {
  return readStringArray(value).filter((item): item is ModelReasoningEffort =>
    item === "minimal" || item === "low" || item === "medium" ||
    item === "high" || item === "xhigh" || item === "max");
}
