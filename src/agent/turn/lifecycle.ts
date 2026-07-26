import { fetchAssistantResponse as fetchProviderAssistantResponse } from "../../provider/index.js";
import {
  applyModelSessionTitle,
  buildSessionTitleMessages,
  shouldGenerateSessionTitle,
} from "../../session/title.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import type { createProviderClientPool } from "../../provider/client.js";
import type { ProviderCapabilities } from "../../provider/capabilities.js";
import type { AssistantResponse, RunTurnOptions, RunTurnResult } from "../types.js";

export interface TurnLifecycleUpdateInput {
  session: RunTurnResult["session"];
  input: string;
  response: AssistantResponse;
  options: RunTurnOptions;
  client: ReturnType<typeof createProviderClientPool>;
  requestModel: string;
  capabilities?: ProviderCapabilities;
  rootDir: string;
}

export async function updateSessionTitleAfterTurn(
  input: TurnLifecycleUpdateInput,
): Promise<RunTurnResult["session"]> {
  if (!shouldGenerateSessionTitle({
    session: input.session,
    userInput: {
      content: input.input,
      source: input.options.inputSource ?? "external",
    },
    assistantResponse: input.response,
  })) return input.session;

  const messages = buildSessionTitleMessages({
    userInput: {
      content: input.input,
      source: input.options.inputSource ?? "external",
    },
    assistantResponse: input.response,
  });
  const modelRequest = {
    messages,
    request: {
      provider: input.options.config.provider,
      model: input.requestModel,
      thinking: "disabled" as const,
      maxOutputTokens: Math.min(input.options.config.maxOutputTokens ?? 512, 512),
      capabilities: input.capabilities,
    },
    tools: [],
    callbacks: undefined,
    abortSignal: input.options.abortSignal,
    observability: {
      rootDir: input.rootDir,
      sessionId: input.session.id,
      configuredModel: input.options.config.model,
    },
  };

  await recordObservabilityEvent(input.rootDir, {
    event: "agent.session_title",
    status: "started",
    sessionId: input.session.id,
    model: input.requestModel,
  });
  input.options.callbacks?.onStatus?.("正在生成会话标题");

  try {
    const titleResponse = input.options.fetchSessionTitleResponse
      ? await input.options.fetchSessionTitleResponse(modelRequest)
      : await fetchProviderAssistantResponse(
        input.client,
        modelRequest.messages,
        modelRequest.request,
        modelRequest.tools,
        modelRequest.callbacks,
        modelRequest.abortSignal,
        undefined,
        modelRequest.observability,
      );
    const session = await input.options.sessionStore.save(
      applyModelSessionTitle(input.session, titleResponse.content ?? ""),
    );
    if (!session.title?.trim()) {
      await recordObservabilityEvent(input.rootDir, {
        event: "agent.session_title",
        status: "skipped",
        sessionId: input.session.id,
        model: input.requestModel,
        details: { reason: "empty_model_response" },
      });
      return input.session;
    }
    await recordObservabilityEvent(input.rootDir, {
      event: "agent.session_title",
      status: "completed",
      sessionId: session.id,
      model: input.requestModel,
      details: { title: session.title },
    });
    return session;
  } catch (error) {
    await recordObservabilityEvent(input.rootDir, {
      event: "agent.session_title",
      status: "failed",
      sessionId: input.session.id,
      model: input.requestModel,
      error,
    });
    return input.session;
  } finally {
    input.options.callbacks?.onStatus?.("");
  }
}
