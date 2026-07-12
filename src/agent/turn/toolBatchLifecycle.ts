import { noteSessionDiff } from "../../session/sessionDiff.js";
import { createMessage, createToolMessage } from "../../session/messages.js";
import { buildToolResultEnvelope } from "../toolResults/evidenceBuilder.js";
import { ControlPlaneLedger } from "../../control/ledger.js";
import { persistToolBatchCheckpoint } from "./persistence.js";
import { executeToolBatch } from "./toolBatch.js";
import { recordObservabilityEvent } from "../../observability/writer.js";
import { SessionEventStore, type SessionEventRecord } from "../../session/events.js";
import { throwIfAborted } from "../../utils/abort.js";
import type { ToolBatchEvidence } from "./toolLoopProgress.js";
import type { ChangeStore } from "../changes/store.js";
import type { ProjectContext, SessionRecord, StoredMessage, ToolExecutionResult } from "../../types.js";
import type { ToolCallRecord } from "../../types.js";
import type { ToolRegistry } from "../../tools/core/types.js";
import type { AssistantResponse, RunTurnOptions } from "../types.js";
import { readToolFailureError } from "./toolFailure.js";

export interface ProcessToolCallBatchInput {
  session: SessionRecord;
  response: AssistantResponse;
  options: RunTurnOptions;
  toolRegistry: ToolRegistry;
  projectContext: ProjectContext;
  changeStore: ChangeStore;
  changedPaths: Set<string>;
}

export interface ProcessToolCallBatchResult {
  session: SessionRecord;
  changedPaths: Set<string>;
  evidence: ToolBatchEvidence;
}

export async function processToolCallBatch(input: ProcessToolCallBatchInput): Promise<ProcessToolCallBatchResult> {
  let session = input.session;
  let changedPaths = new Set(input.changedPaths);
  const { response, options, toolRegistry, projectContext, changeStore } = input;

  if (response.content && !response.streamedAssistantContent) {
    options.callbacks?.onAssistantStage?.(response.content);
  }
  session = await options.sessionStore.appendMessages(session, [
    createMessage("assistant", response.content, {
      reasoningContent: response.reasoningContent,
      toolCalls: response.toolCalls,
    }),
  ]);

  const batchToolMessages: StoredMessage[] = [];
  const batchModelOutputs: string[] = [];
  const batchChangedPaths = new Set<string>();
  const sessionEvents = new SessionEventStore(options.config.paths.eventsDir);
  const toolEntryByName = new Map((toolRegistry.entries ?? []).map((entry) => [entry.name, entry]));
  if (options.turnId) {
    const ledger = new ControlPlaneLedger(projectContext.stateRootDir);
    try {
      ledger.transaction(() => {
        for (const toolCall of response.toolCalls) {
          ledger.toolCalls.start({
            callId: toolCall.id,
            turnId: options.turnId!,
            sessionId: session.id,
            toolName: toolCall.function.name,
            argumentsJson: toolCall.function.arguments,
            effect: toolEntryByName.get(toolCall.function.name)?.effect ?? "external",
          });
        }
      });
    } finally {
      ledger.close();
    }
  }
  for (const toolCall of response.toolCalls) {
    throwIfAborted(options.abortSignal, "Turn aborted by user.");
    await sessionEvents.append({
      type: "tool.started",
      sessionId: session.id,
      cwd: options.cwd,
      details: buildToolStartedEventDetails(toolCall),
    });
    options.callbacks?.onToolCall?.(toolCall.function.name, toolCall.function.arguments);
    await recordObservabilityEvent(projectContext.stateRootDir, {
      event: "tool.execution",
      status: "started",
      sessionId: session.id,
      toolName: toolCall.function.name,
    });
  }
  const batchExecution = await executeToolBatch({
    session,
    toolCalls: response.toolCalls,
    toolRegistry,
    options,
    projectContext,
    changeStore,
    onItemSettled: options.turnId
      ? async (item) => {
          const result = buildToolResultEnvelope({
            callId: item.toolCall.id,
            toolName: item.toolCall.function.name,
            rawArguments: item.toolCall.function.arguments,
            cwd: options.cwd,
            result: item.result,
          });
          const ledger = new ControlPlaneLedger(projectContext.stateRootDir);
          try {
            ledger.toolCalls.settle({
              callId: item.toolCall.id,
              result,
              beforeHash: typeof result.facts.beforeHash === "string" ? result.facts.beforeHash : undefined,
              afterHash: typeof result.facts.afterHash === "string" ? result.facts.afterHash : undefined,
            });
          } finally {
            ledger.close();
          }
        }
      : undefined,
  });
  session = batchExecution.session;

  for (const item of batchExecution.items) {
    const { toolCall, durationMs } = item;
    let result = item.result;
    throwIfAborted(options.abortSignal, "Turn aborted by user.");
    let metadata = "metadata" in result ? result.metadata : undefined;
    if (metadata?.changedPaths?.length) {
      changedPaths = new Set([...changedPaths, ...metadata.changedPaths]);
      metadata.changedPaths.forEach((changedPath) => batchChangedPaths.add(changedPath));
      session = await options.sessionStore.save(noteSessionDiff({
        ...session,
      }, metadata.sessionDiff));
    } else if (metadata?.sessionDiff) {
      session = await options.sessionStore.save(noteSessionDiff(session, metadata.sessionDiff));
    }
    const failureError = result.ok ? undefined : readToolFailureError(result.output);
    await recordObservabilityEvent(projectContext.stateRootDir, {
      event: "tool.execution",
      status: result.ok ? "completed" : "failed",
      sessionId: session.id,
      toolName: toolCall.function.name,
      durationMs,
      error: failureError,
      details: {
        changedPathCount: metadata?.changedPaths?.length ?? 0,
      },
    });
    await sessionEvents.append({
      type: result.ok ? "tool.completed" : "tool.failed",
      sessionId: session.id,
      cwd: options.cwd,
      details: buildToolFinishedEventDetails({
        toolCall,
        durationMs,
        changedPathCount: metadata?.changedPaths?.length ?? 0,
        error: failureError ? formatToolFailureError(failureError) : undefined,
      }),
    });
    if (metadata?.outputGovernance) {
      await recordObservabilityEvent(projectContext.stateRootDir, {
        event: "tool.output",
        status: result.ok ? "completed" : "failed",
        sessionId: session.id,
        toolName: toolCall.function.name,
        durationMs,
        details: {
          kind: metadata.outputGovernance.kind,
          mode: metadata.outputGovernance.mode,
          rawChars: metadata.outputGovernance.rawChars,
          projectedChars: metadata.outputGovernance.projectedChars,
          rawTokens: metadata.outputGovernance.rawTokens,
          projectedTokens: metadata.outputGovernance.projectedTokens,
          savedTokens: metadata.outputGovernance.savedTokens,
          savingsRatio: metadata.outputGovernance.savingsRatio,
          truncated: metadata.outputGovernance.truncated,
          outputPath: metadata.outputGovernance.outputPath,
          degraded: metadata.outputGovernance.degraded,
          reason: metadata.outputGovernance.reason,
        },
      });
    }
    if (result.ok) {
      options.callbacks?.onToolResult?.(toolCall.function.name, result.output);
    } else {
      options.callbacks?.onToolError?.(toolCall.function.name, result.output);
    }
    const toolResult = buildToolResultEnvelope({
      callId: toolCall.id,
      toolName: toolCall.function.name,
      rawArguments: toolCall.function.arguments,
      cwd: options.cwd,
      result,
    });
    const modelOutput = toolResult.modelView;
    batchModelOutputs.push(modelOutput);
    const storedToolMessage = createToolMessage(toolCall.id, modelOutput, toolCall.function.name, toolResult);
    batchToolMessages.push(storedToolMessage);
    session = await options.sessionStore.appendMessages(session, [storedToolMessage]);
    await recordObservabilityEvent(projectContext.stateRootDir, {
      event: "tool.evidence",
      status: toolResult.status === "success" ? "completed" : "failed",
      sessionId: session.id,
      toolName: toolResult.toolName,
      durationMs,
      details: {
        callId: toolResult.callId,
        modelChars: toolResult.modelView.length,
        compactChars: toolResult.compactView.length,
        artifactCount: toolResult.artifacts.length,
        truncated: toolResult.truncation.truncated,
        omittedChars: toolResult.truncation.omittedChars,
        targetPath: toolResult.provenance?.targetPath,
        errorCode: toolResult.error?.code,
      },
    });
  }

  session = await persistToolBatchCheckpoint({
    session,
    sessionStore: options.sessionStore,
    toolNames: response.toolCalls.map((toolCall) => toolCall.function.name),
    toolMessages: batchToolMessages,
    changedPaths: [...batchChangedPaths],
  });
  return {
    session,
    changedPaths,
    evidence: {
      toolCalls: response.toolCalls.map((toolCall) => ({
        name: toolCall.function.name,
        arguments: toolCall.function.arguments,
      })),
      modelOutputs: batchModelOutputs,
      changedPaths: [...batchChangedPaths],
    },
  };
}

function buildToolStartedEventDetails(toolCall: ToolCallRecord): SessionEventRecord["details"] {
  return {
    toolName: toolCall.function.name,
    toolCallId: toolCall.id,
    argumentsPreview: previewToolArguments(toolCall.function.arguments),
  };
}

function buildToolFinishedEventDetails(input: {
  toolCall: ToolCallRecord;
  durationMs: number;
  changedPathCount: number;
  error?: string;
}): SessionEventRecord["details"] {
  return {
    toolName: input.toolCall.function.name,
    toolCallId: input.toolCall.id,
    durationMs: input.durationMs,
    changedPathCount: input.changedPathCount,
    error: input.error,
  };
}

function previewToolArguments(rawArgs: string): string {
  const normalized = rawArgs.replace(/\s+/g, " ").trim();
  return normalized.length > 240 ? `${normalized.slice(0, 237)}...` : normalized;
}

function formatToolFailureError(error: ReturnType<typeof readToolFailureError>): string {
  return error.code ? `${error.code}: ${error.message}` : error.message;
}
