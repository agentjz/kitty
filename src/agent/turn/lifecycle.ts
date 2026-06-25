import { fetchAssistantResponse as fetchProviderAssistantResponse } from "../../provider/index.js";
import { buildSessionMemoryCompactionMessages } from "../../session/memoryCompaction.js";
import { updateSessionMemory } from "../../session/memory.js";
import {
  applyModelSessionTitle,
  buildSessionTitleMessages,
  shouldGenerateSessionTitle,
} from "../../session/title.js";
import { readUserInput } from "../../session/turnFrame.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import type { createProviderClientPool } from "../../provider/client.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions, RunTurnResult } from "../types.js";

export interface TurnLifecycleUpdateInput {
  session: RunTurnResult["session"];
  input: string;
  response: AssistantResponse;
  options: RunTurnOptions;
  client: ReturnType<typeof createProviderClientPool>;
  requestModel: string;
  identity: AgentIdentity;
  rootDir: string;
}

export async function updateSessionMemoryAfterTurn(
  input: TurnLifecycleUpdateInput,
): Promise<RunTurnResult["session"]> {
  if (!input.response.content?.trim()) {
    return input.session;
  }
  const userInput = readUserInput({
    content: input.input,
    source: input.options.inputSource ?? "external",
  });
  if (!userInput) {
    return input.session;
  }

  const messages = buildSessionMemoryCompactionMessages({
    session: input.session,
    userInput,
    assistantResponse: input.response,
  });
  const modelRequest = {
    messages,
    request: {
      provider: input.options.config.provider,
      model: input.requestModel,
      thinking: "disabled" as const,
      maxOutputTokens: Math.min(input.options.config.maxOutputTokens ?? 4_000, 4_000),
    },
    tools: [],
    callbacks: undefined,
    abortSignal: input.options.abortSignal,
    observability: {
      rootDir: input.rootDir,
      sessionId: input.session.id,
      identityKind: input.identity.kind,
      identityName: input.identity.name,
      configuredModel: input.options.config.model,
    },
  };

  await recordObservabilityEvent(input.rootDir, {
    event: "agent.session_memory",
    status: "started",
    sessionId: input.session.id,
    identityKind: input.identity.kind,
    identityName: input.identity.name,
    model: input.requestModel,
  });
  input.options.callbacks?.onStatus?.("总结中");

  try {
    const memoryResponse = input.options.fetchSessionMemoryResponse
      ? await input.options.fetchSessionMemoryResponse(modelRequest)
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
    const summary = memoryResponse.content?.trim();
    if (!summary) {
      await recordObservabilityEvent(input.rootDir, {
        event: "agent.session_memory",
        status: "skipped",
        sessionId: input.session.id,
        identityKind: input.identity.kind,
        identityName: input.identity.name,
        model: input.requestModel,
        details: {
          reason: "empty_model_response",
        },
      });
      return input.session;
    }

    const session = await input.options.sessionStore.save(updateSessionMemory(input.session, summary));
    await recordObservabilityEvent(input.rootDir, {
      event: "agent.session_memory",
      status: "completed",
      sessionId: session.id,
      identityKind: input.identity.kind,
      identityName: input.identity.name,
      model: input.requestModel,
      details: {
        summaryChars: session.sessionMemory?.summary.length ?? 0,
      },
    });
    return session;
  } catch (error) {
    await recordObservabilityEvent(input.rootDir, {
      event: "agent.session_memory",
      status: "failed",
      sessionId: input.session.id,
      identityKind: input.identity.kind,
      identityName: input.identity.name,
      model: input.requestModel,
      error,
    });
    return input.session;
  } finally {
    input.options.callbacks?.onStatus?.("");
  }
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
  })) {
    return input.session;
  }

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
    },
    tools: [],
    callbacks: undefined,
    abortSignal: input.options.abortSignal,
    observability: {
      rootDir: input.rootDir,
      sessionId: input.session.id,
      identityKind: input.identity.kind,
      identityName: input.identity.name,
      configuredModel: input.options.config.model,
    },
  };

  await recordObservabilityEvent(input.rootDir, {
    event: "agent.session_title",
    status: "started",
    sessionId: input.session.id,
    identityKind: input.identity.kind,
    identityName: input.identity.name,
    model: input.requestModel,
  });
  input.options.callbacks?.onStatus?.("标题生成中");

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
        identityKind: input.identity.kind,
        identityName: input.identity.name,
        model: input.requestModel,
        details: {
          reason: "empty_model_response",
        },
      });
      return input.session;
    }

    await recordObservabilityEvent(input.rootDir, {
      event: "agent.session_title",
      status: "completed",
      sessionId: session.id,
      identityKind: input.identity.kind,
      identityName: input.identity.name,
      model: input.requestModel,
      details: {
        title: session.title,
      },
    });
    return session;
  } catch (error) {
    await recordObservabilityEvent(input.rootDir, {
      event: "agent.session_title",
      status: "failed",
      sessionId: input.session.id,
      identityKind: input.identity.kind,
      identityName: input.identity.name,
      model: input.requestModel,
      error,
    });
    return input.session;
  } finally {
    input.options.callbacks?.onStatus?.("");
  }
}
