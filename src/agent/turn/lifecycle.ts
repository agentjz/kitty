import { fetchAssistantResponse as fetchProviderAssistantResponse } from "../../provider/index.js";
import { buildSessionMemoryCompactionMessages } from "../../session/memoryCompaction.js";
import { updateSessionMemory } from "../../session/memory.js";
import { readUserInput } from "../../session/turnFrame.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import type { createProviderClientPool } from "../../provider/client.js";
import type { AgentIdentity, AssistantResponse, RunTurnOptions, RunTurnResult } from "../types.js";

export interface UpdateSessionMemoryAfterTurnInput {
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
  input: UpdateSessionMemoryAfterTurnInput,
): Promise<RunTurnResult["session"]> {
  if (!input.response.content?.trim()) {
    return input.session;
  }
  const userInput = readUserInput(input.input);
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
  }
}
