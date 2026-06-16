import { AgentTurnError, getErrorMessage } from "../errors.js";
import { fetchAssistantResponse as fetchProviderAssistantResponse } from "../../provider/index.js";
import { createProviderClientPool } from "../../provider/client.js";
import { buildRecoveryRequestConfig, buildRecoveryStatus, computeRecoveryDelayMs, isRecoverableTurnError, sleep } from "../../provider/retryPolicy.js";
import {
  buildContextRuntimePromptLayers,
  buildContextRuntimeRequest,
} from "../../context/runtime/index.js";
import { createProviderRecoveryTransition } from "../runtimeTransition.js";
import { resolveAgentProfile } from "../profiles/registry.js";
import { emitAssistantFinalOutput, emitAssistantReasoning } from "./finalize.js";
import { updateSessionMemoryAfterTurn, updateSessionTitleAfterTurn } from "./lifecycle.js";
import {
  initializeTurnSession,
  persistRecoveryTurn,
} from "./persistence.js";
import { processToolCallBatch } from "./toolBatchLifecycle.js";
import { resolveToollessTurn } from "./toolless.js";
import { extendPromptLayersForTurnState } from "./state.js";
import { consumeToolLoopCloseout, createToolLoopProgressState, recordToolBatchProgress } from "./toolLoopProgress.js";
import type { RunTurnOptions, RunTurnResult } from "../types.js";
import { ChangeStore } from "../changes/store.js";
import { ControlPlaneLedger } from "../../control/ledger.js";
import { loadProjectContext } from "../../context/projectContext.js";
import { createDefaultAgentToolRegistry } from "../../tools/registry.js";
import { throwIfAborted } from "../../utils/abort.js";

export type { AgentCallbacks, RunTurnOptions } from "../types.js";

export async function runAgentTurn(options: RunTurnOptions): Promise<RunTurnResult> {
  const projectContext = await loadProjectContext(options.cwd, {
    projectDocMaxBytes: options.config.projectDocMaxBytes,
  });
  const identity = options.identity ?? { kind: "lead" as const, name: "lead" };
  const turnModelConfig = options.config;
  const profile = resolveAgentProfile(options.config.profile);
  if (!turnModelConfig.apiKey) {
    throw new Error("Missing API key. Open the project's .env file and add KITTY_API_KEY.");
  }
  let session = await initializeTurnSession(options.session, options.input, options.sessionStore);
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
  let consecutiveRequestFailures = 0;
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
      let promptLayers = buildContextRuntimePromptLayers({
        cwd: options.cwd,
        config: turnModelConfig,
        projectContext,
        taskLifecycle,
        taskState: session.taskState,
        todoItems: session.todoItems,
        sessionMemory: session.sessionMemory,
        workset: session.workset,
        runtimeState: turnRuntimeState,
        checkpoint: session.checkpoint,
        profile,
        messages: session.messages,
      });
      promptLayers = extendPromptLayersForTurnState(promptLayers, consecutiveRequestFailures);
      const requestModel = turnModelConfig.model;
      const requestConfig = buildRecoveryRequestConfig(options.config, requestModel, consecutiveRequestFailures);
      const requestContext = buildContextRuntimeRequest({
        prompt: promptLayers,
        session,
        config: requestConfig,
      });
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
        consecutiveRequestFailures = 0;
      } catch (error) {
        if (!isRecoverableTurnError(error)) {
          throw error;
        }
        consecutiveRequestFailures += 1;
        const delayMs = computeRecoveryDelayMs(consecutiveRequestFailures);
        const transition = createProviderRecoveryTransition({
          consecutiveFailures: consecutiveRequestFailures,
          error,
          configuredModel: options.config.model,
          requestModel,
          requestConfig,
          delayMs,
        });
        const recoveryLedger = new ControlPlaneLedger(projectContext.stateRootDir);
        try {
          recoveryLedger.taskLifecycle.update({
            sessionId: session.id,
            stage: "recovery",
            reason: transition.reason.code,
          });
        } finally {
          recoveryLedger.close();
        }
        session = await persistRecoveryTurn(session, options.sessionStore, transition);
        options.callbacks?.onStatus?.(buildRecoveryStatus(transition));
        await (options.recoverySleep ?? sleep)(delayMs, options.abortSignal);
        continue;
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
        completed.result.session = await updateSessionMemoryAfterTurn({
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
