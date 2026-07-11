import { AgentTurnError, getErrorMessage } from "../errors.js";
import { fetchAssistantResponse as fetchProviderAssistantResponse } from "../../provider/index.js";
import { createProviderClientPool } from "../../provider/client.js";
import {
  buildContextRuntimePromptLayers,
  buildContextRuntimeRequest,
} from "../../context/runtime/index.js";
import { resolveAgentProfile } from "../profiles/registry.js";
import { emitAssistantFinalOutput, emitAssistantReasoning } from "./finalize.js";
import { updateSessionTitleAfterTurn } from "./lifecycle.js";
import {
  initializeTurnSession,
} from "./persistence.js";
import { processToolCallBatch } from "./toolBatchLifecycle.js";
import { resolveToollessTurn } from "./toolless.js";
import { consumeToolLoopCloseout, createToolLoopProgressState, recordToolBatchProgress } from "./toolLoopProgress.js";
import type { RunTurnOptions, RunTurnResult } from "../types.js";
import { ChangeStore } from "../changes/store.js";
import { ControlPlaneLedger } from "../../control/ledger.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { createDefaultAgentToolRegistry } from "../../tools/registry.js";
import { throwIfAborted } from "../../utils/abort.js";

export type { AgentCallbacks, RunTurnOptions } from "../types.js";

export async function runAgentTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  const loadedProjectContext = await loadProjectContext(options.cwd, {
    projectDocMaxBytes: options.config.projectDocMaxBytes,
  });
  const projectContext = options.stateRootDir
    ? { ...loadedProjectContext, stateRootDir: options.stateRootDir }
    : loadedProjectContext;
  const identity = options.identity ?? { kind: "lead" as const, name: "lead" };
  const turnModelConfig = options.config;
  const profile = resolveAgentProfile(options.config.profile);
  if (!turnModelConfig.apiKey) {
    throw new Error("Missing API key. Open the project's .env file and add KITTY_API_KEY.");
  }
  let session = await initializeTurnSession(
    options.session,
    options.input,
    options.sessionStore,
    options.inputSource ?? "external",
  );
  const controlLedger = new ControlPlaneLedger(projectContext.stateRootDir);
  try {
    controlLedger.taskLifecycle.startTurn({
      sessionId: session.id,
      reason: "turn_started",
    });
  } finally {
    controlLedger.close();
  }
  const client = createProviderClientPool(turnModelConfig);
  const ownsToolRegistry = !options.toolRegistry;
  const toolRegistry = options.toolRegistry ?? (await createDefaultAgentToolRegistry(options.config));
  const changeStore = new ChangeStore(options.config.paths.changesDir);
  let changedPaths = new Set<string>();
  let toolLoopProgress = createToolLoopProgressState();
  let runtimePromptState = options.runtimePromptState;
  let unavailableToolProtocolOutputs = 0;
  try {
    for (;;) {
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      const turnRuntimeState = {
        ...(runtimePromptState ?? {}),
        identity,
      };
      const lifecycleLedger = new ControlPlaneLedger(projectContext.stateRootDir);
      let taskLifecycle;
      try {
        taskLifecycle = lifecycleLedger.taskLifecycle.loadCurrent(session.id);
      } finally {
        lifecycleLedger.close();
      }
      const promptLayers = buildContextRuntimePromptLayers({
        cwd: options.cwd,
        config: turnModelConfig,
        projectContext,
        taskLifecycle,
        taskState: session.taskState,
        todoItems: session.todoItems,
        workset: session.workset,
        runtimeState: turnRuntimeState,
        checkpoint: session.checkpoint,
        profile,
        messages: session.messages,
      });
      const requestModel = turnModelConfig.model;
      const requestContext = buildContextRuntimeRequest({
        prompt: promptLayers,
        session,
        config: {
          provider: options.config.provider,
          model: requestModel,
          contextWindowMessages: options.config.contextWindowMessages,
          maxContextChars: options.config.maxContextChars,
          maxOutputTokens: options.config.maxOutputTokens,
          contextSummaryChars: options.config.contextSummaryChars,
        },
      });
      if (requestContext.epoch) {
        const contextLedger = new ControlPlaneLedger(projectContext.stateRootDir);
        try {
          contextLedger.contextEpochs.record({
            sessionId: session.id,
            ...requestContext.epoch,
            budget: requestContext.budget,
          });
        } finally {
          contextLedger.close();
        }
      }
      session = await options.sessionStore.save({
        ...session,
        contextBudget: requestContext.budget,
      });
      const turnToolDefinitions = toolLoopProgress.forceCloseout ? [] : toolRegistry.definitions;
      if (requestContext.compressed) {
        options.callbacks?.onStatus?.(`Context compressed automatically at ~${requestContext.estimatedChars} chars to keep the turn running.`);
      }
      let response;
      options.callbacks?.onModelWaitStart?.();
      try {
        const modelRequest = {
          messages: requestContext.messages,
          request: {
            provider: turnModelConfig.provider,
            model: requestModel,
            thinking: turnModelConfig.thinking,
            reasoningEffort: turnModelConfig.reasoningEffort,
            maxOutputTokens: turnModelConfig.maxOutputTokens,
            sessionId: session.id,
            projectRoot: projectContext.rootDir,
          },
          tools: turnToolDefinitions,
          callbacks: options.callbacks,
          abortSignal: options.abortSignal,
          observability: {
            rootDir: projectContext.stateRootDir,
            sessionId: session.id,
            identityKind: identity.kind,
            identityName: identity.name,
            configuredModel: turnModelConfig.model,
            turnId: options.turnId,
          },
        };
        response = options.fetchAssistantResponse
          ? await options.fetchAssistantResponse(modelRequest)
          : await fetchProviderAssistantResponse(
            client,
            modelRequest.messages,
            modelRequest.request,
            modelRequest.tools,
            modelRequest.callbacks,
            modelRequest.abortSignal,
            undefined,
            modelRequest.observability,
          );
      } finally {
        options.callbacks?.onModelWaitStop?.();
      }
      emitAssistantReasoning(response, options);
      throwIfAborted(options.abortSignal, "Turn aborted by user.");
      if (response.toolCalls.length === 0) {
        if (turnToolDefinitions.length === 0 && looksLikeToolProtocolText(response.content)) {
          unavailableToolProtocolOutputs += 1;
          if (unavailableToolProtocolOutputs > 2) {
            throw new Error("Assistant emitted tool-call protocol text while no tools were available.");
          }
          runtimePromptState = {
            ...(runtimePromptState ?? {}),
            internalFactBlocks: [
              ...(runtimePromptState?.internalFactBlocks ?? []),
              "Tool protocol text was emitted while no tools were available. Produce a final natural-language answer from the available facts.",
            ],
          };
          continue;
        }
        unavailableToolProtocolOutputs = 0;
        const completed = await resolveToollessTurn({
          session,
          response,
          identity,
          changedPaths,
          options,
        });
        if (completed.kind === "continue") {
          session = completed.session;
          continue;
        }
        completed.result.session = await updateSessionTitleAfterTurn({
          session: completed.result.session,
          input: options.input,
          response,
          options,
          client,
          requestModel,
          identity,
          rootDir: projectContext.stateRootDir,
        });
        const completionLedger = new ControlPlaneLedger(projectContext.stateRootDir);
        try {
          completionLedger.taskLifecycle.complete({
            sessionId: completed.result.session.id,
            reason: "finalize.completed",
            completionFacts: response.content ? [response.content] : undefined,
            verificationFacts: completed.result.changedPaths.length > 0
              ? [`Changed paths: ${completed.result.changedPaths.join(", ")}`]
              : undefined,
          });
        } finally {
          completionLedger.close();
        }
        emitAssistantFinalOutput(response, options);
        return completed.result;
      }
      const batchResult = await processToolCallBatch({
        session,
        response,
        options,
        identity,
        toolRegistry,
        projectContext,
        changeStore,
        changedPaths,
      });
      session = batchResult.session;
      changedPaths = batchResult.changedPaths;
      const progress = recordToolBatchProgress(toolLoopProgress, batchResult.evidence);
      toolLoopProgress = progress.state;
      if (batchResult.yieldResult) {
        toolLoopProgress = consumeToolLoopCloseout(toolLoopProgress);
        return batchResult.yieldResult;
      }
      if (progress.internalFactBlock) {
        runtimePromptState = {
          ...(runtimePromptState ?? {}),
          internalFactBlocks: [
            ...(runtimePromptState?.internalFactBlocks ?? []),
            progress.internalFactBlock,
          ],
        };
      }
    }
  } catch (error) {
    const timestamp = new Date().toISOString();
    const settledSession = session.checkpoint
      ? {
          ...session,
          checkpoint: {
            ...session.checkpoint,
            flow: {
              ...session.checkpoint.flow,
              runState: {
                status: "idle" as const,
                source: "checkpoint" as const,
                pendingToolCallCount: 0,
                updatedAt: timestamp,
              },
              updatedAt: timestamp,
            },
            updatedAt: timestamp,
          },
        }
      : session;
    const persistedSession = await options.sessionStore.save(settledSession).catch(() => settledSession);
    throw new AgentTurnError(getErrorMessage(error), persistedSession, { cause: error });
  } finally {
    if (ownsToolRegistry) await toolRegistry.close?.().catch(() => undefined);
  }
}

function looksLikeToolProtocolText(content: string | null | undefined): boolean {
  const text = String(content ?? "").trim();
  return text.includes("<｜｜DSML｜｜tool_calls>") ||
    text.includes("<tool_call>") ||
    text.includes("\"tool_calls\"");
}
