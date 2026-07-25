import { ControlPlaneLedger } from "../control/ledger.js";
import { ToolCallAlreadyDispatchedError } from "../control/toolCalls.js";
import type { ToolExecutionResult } from "../types.js";
import type { ToolContext } from "../tools/index.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

export interface ExternalDispatch {
  operationId: string;
  shouldDispatch: boolean;
  settle(result: Omit<ToolExecutionResult, "metadata"> & { metadata?: ToolExecutionResult["metadata"] }): ToolExecutionResult;
  fail(error: unknown): ToolExecutionResult;
  uncertain(error: unknown): ToolExecutionResult;
  close(): void;
}

export function beginExternalDispatch(context: ToolContext): ExternalDispatch {
  const ownership = requireOwnership(context);
  const ledger = new ControlPlaneLedger(context.projectContext.stateRootDir);
  let operationId: string;
  let shouldDispatch = true;
  try {
    try {
      operationId = ledger.toolCalls.dispatch({
        callId: context.toolCallId,
        turnId: context.turnId,
        ownerToken: ownership.ownerToken,
        ownerGeneration: ownership.ownerGeneration,
      }).operationId;
    } catch (error) {
      if (!(error instanceof ToolCallAlreadyDispatchedError)) throw error;
      operationId = error.operationId;
      shouldDispatch = false;
    }
  } finally {
    ledger.close();
  }

  let closed = false;
  const heartbeat = setInterval(() => {
    if (closed) return;
    const current = new ControlPlaneLedger(context.projectContext.stateRootDir);
    try {
      current.toolCalls.heartbeat({
        callId: context.toolCallId,
        turnId: context.turnId,
        ownerToken: ownership.ownerToken,
        ownerGeneration: ownership.ownerGeneration,
      });
    } catch {
      closed = true;
      clearInterval(heartbeat);
    } finally {
      current.close();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeat.unref();

  const close = (): void => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
  };

  return {
    operationId,
    shouldDispatch,
    close,
    settle(result) {
      close();
      return {
        ...result,
        metadata: {
          ...result.metadata,
          external: {
            operationId,
            dispatchState: "settled",
          },
        },
      };
    },
    fail(error) {
      close();
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        output: JSON.stringify({
          ok: false,
          operationId,
          error: message,
        }, null, 2),
        metadata: {
          external: {
            operationId,
            dispatchState: "settled",
          },
        },
      };
    },
    uncertain(error) {
      close();
      const message = error instanceof Error ? error.message : String(error);
      return {
        ok: false,
        output: JSON.stringify({
          ok: false,
          status: "uncertain",
          operationId,
          error: message,
          recovery: "Inspect external state before deciding whether to issue another action.",
        }, null, 2),
        metadata: {
          external: {
            operationId,
            dispatchState: "dispatched",
            outcome: "uncertain",
          },
        },
      };
    },
  };
}

function requireOwnership(context: ToolContext): { ownerToken: string; ownerGeneration: number } {
  if (!context.turnId || !context.toolCallId || !context.turnOwnerToken || context.turnOwnerGeneration === undefined) {
    throw new Error("External capability dispatch requires durable turn and tool-call ownership.");
  }
  return {
    ownerToken: context.turnOwnerToken,
    ownerGeneration: context.turnOwnerGeneration,
  };
}
