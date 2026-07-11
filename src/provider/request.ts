import type OpenAI from "openai";

import { API_MAX_ATTEMPTS, createApiRetryBudget, withApiRetries } from "./apiRetry.js";
import type { ModelRequestMetric } from "./metrics.js";
import { isAbortError } from "../utils/abort.js";
import type { AssistantResponse, AgentCallbacks } from "../agent/types.js";
import { resolveProviderCapabilities } from "./capabilities.js";
import type { ProviderMessage, ProviderWireAdapter } from "./contract.js";
import { chatCompletionsAdapter } from "./chatCompletionsAdapter.js";
import { responsesAdapter } from "./responsesAdapter.js";
import { isProviderClientPool, type ProviderClientPool } from "./client.js";
import {
  canRetryWithAlternateBaseUrl,
  isStreamingFallbackEligible,
  normalizeProviderError,
} from "./errors.js";
import {
  recordProviderRequestEvent,
  type ProviderRequestObservability,
} from "./requestObservability.js";
import type { FunctionToolDefinition } from "../tools/index.js";
import type { ModelReasoningEffort, ModelThinkingMode } from "../types.js";

export async function fetchAssistantResponse(
  client: OpenAI | ProviderClientPool,
  messages: ProviderMessage[],
  request: {
    provider: string;
    model: string;
    thinking?: ModelThinkingMode;
    reasoningEffort?: ModelReasoningEffort;
    maxOutputTokens?: number;
    sessionId?: string;
    projectRoot?: string;
  },
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
  observability?: ProviderRequestObservability,
): Promise<AssistantResponse> {
  const capabilities = resolveProviderCapabilities(request);
  const adapter = selectProviderWireAdapter(capabilities.wireApi);

  return tryFetch(
    adapter,
    client,
    messages,
    request,
    tools,
    callbacks,
    false,
    abortSignal,
    onRequestMetric,
    observability,
  );
}

async function tryFetch(
  adapter: ProviderWireAdapter,
  client: OpenAI | ProviderClientPool,
  messages: ProviderMessage[],
  request: {
    provider: string;
    model: string;
    thinking?: ModelThinkingMode;
    reasoningEffort?: ModelReasoningEffort;
    maxOutputTokens?: number;
    sessionId?: string;
    projectRoot?: string;
  },
  tools: FunctionToolDefinition[] | undefined,
  callbacks: AgentCallbacks | undefined,
  forceReasoning: boolean,
  abortSignal?: AbortSignal,
  onRequestMetric?: (metric: ModelRequestMetric) => void,
  observability?: ProviderRequestObservability,
): Promise<AssistantResponse> {
  const startedAt = Date.now();
  let latestMetric: ModelRequestMetric | undefined;
  let resolvedBaseUrl: string | undefined;
  const forwardMetric = (metric: ModelRequestMetric) => {
    latestMetric = metric;
    onRequestMetric?.(metric);
  };
  const retryOptions = {
    abortSignal,
    onRetry: (state: {
      nextAttempt: number;
      maxAttempts: number;
      delayMs: number;
    }) => {
      callbacks?.onStatus?.(
        `模型请求暂时失败，${formatRetryDelay(state.delayMs)} 后重试（${state.nextAttempt}/${state.maxAttempts}）。`,
      );
    },
  };
  const retryBudget = createApiRetryBudget();

  await recordProviderRequestEvent({
    observability,
    request,
    wireApi: adapter.wireApi,
    status: "started",
  });

  try {
    const response = await withApiRetries(
      () => invokeWithProviderClients(client, async (providerClient, baseUrl) => {
        resolvedBaseUrl = baseUrl;
        return adapter.fetchStreaming(providerClient, {
          provider: request.provider,
          model: request.model,
          messages,
          tools,
          callbacks,
          forceReasoning,
          thinking: request.thinking,
          reasoningEffort: request.reasoningEffort,
          maxOutputTokens: request.maxOutputTokens,
          sessionId: request.sessionId,
          projectRoot: request.projectRoot,
          abortSignal,
          onRequestMetric: forwardMetric,
        });
      }),
      {
        ...retryOptions,
        budget: retryBudget,
      },
    );

    await recordProviderRequestEvent({
      observability,
      request,
      wireApi: adapter.wireApi,
      status: "completed",
      startedAt,
      baseUrl: resolvedBaseUrl,
      usage: latestMetric?.usage,
    });
    return response;
  } catch (error) {
    if (isAbortError(error)) {
      throw error;
    }

    if (!isStreamingFallbackEligible(error)) {
      await recordProviderRequestEvent({
        observability,
        request,
        wireApi: adapter.wireApi,
        status: "failed",
        startedAt,
        baseUrl: resolvedBaseUrl,
        usage: latestMetric?.usage,
        error,
      });
      throw error;
    }

    if (retryBudget.attempts >= API_MAX_ATTEMPTS) {
      throw error;
    }

    try {
      const response = await withApiRetries(
        () => invokeWithProviderClients(client, async (providerClient, baseUrl) => {
          resolvedBaseUrl = baseUrl;
          return adapter.fetchNonStreaming(providerClient, {
            provider: request.provider,
            model: request.model,
            messages,
            tools,
            callbacks,
            forceReasoning,
            thinking: request.thinking,
            reasoningEffort: request.reasoningEffort,
            maxOutputTokens: request.maxOutputTokens,
            sessionId: request.sessionId,
            projectRoot: request.projectRoot,
            abortSignal,
            onRequestMetric: forwardMetric,
          });
        }),
        {
          ...retryOptions,
          budget: retryBudget,
        },
      );

      await recordProviderRequestEvent({
        observability,
        request,
        wireApi: adapter.wireApi,
        status: "completed",
        startedAt,
        baseUrl: resolvedBaseUrl,
        usage: latestMetric?.usage,
      });
      return response;
    } catch (fallbackError) {
      if (!isAbortError(fallbackError)) {
        await recordProviderRequestEvent({
          observability,
          request,
          wireApi: adapter.wireApi,
          status: "failed",
          startedAt,
          baseUrl: resolvedBaseUrl,
          usage: latestMetric?.usage,
          error: fallbackError,
        });
      }
      throw fallbackError;
    }
  }
}

function formatRetryDelay(ms: number): string {
  return ms % 1_000 === 0 ? `${ms / 1_000}s` : `${ms}ms`;
}

function selectProviderWireAdapter(
  wireApi: "responses" | "chat.completions",
): ProviderWireAdapter {
  if (wireApi === "responses") {
    return responsesAdapter;
  }

  return chatCompletionsAdapter;
}

async function invokeWithProviderClients<T>(
  client: OpenAI | ProviderClientPool,
  operation: (client: OpenAI, baseUrl: string | undefined) => Promise<T>,
): Promise<T> {
  if (!isProviderClientPool(client)) {
    try {
      return await operation(client, undefined);
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      throw normalizeProviderError(error);
    }
  }

  let lastError: unknown;
  const candidates = client.candidates();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    try {
      const result = await operation(candidate.client, candidate.baseUrl);
      client.markHealthy(candidate.baseUrl);
      return result;
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      const providerError = normalizeProviderError(error);
      lastError = providerError;

      const hasMoreCandidates = index < candidates.length - 1;
      if (!hasMoreCandidates || !canRetryWithAlternateBaseUrl(providerError)) {
        throw providerError;
      }
    }
  }

  throw lastError;
}
