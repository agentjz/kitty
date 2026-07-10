import type { RunTurnResult } from "../types.js";
import type {
  RuntimeContinueTransition,
  RuntimeFinalizeTransition,
  RuntimeTerminalTransition,
  RuntimeYieldTransition,
  SessionRecord,
} from "../../types.js";
import { normalizeText, takeLastUnique, truncate } from "./shared.js";

export function createToolBatchTransition(
  input: {
    toolNames: string[];
    changedPaths?: string[];
  },
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.after_tool_batch",
      toolNames: takeLastUnique(input.toolNames),
      changedPaths: takeLastUnique(input.changedPaths ?? []),
    },
    timestamp,
  };
}

export function createEmptyAssistantResponseTransition(
  timestamp = new Date().toISOString(),
): RuntimeContinueTransition {
  return {
    action: "continue",
    reason: {
      code: "continue.empty_assistant_response",
    },
    timestamp,
  };
}

export function createFinalizeTransition(
  input: {
    changedPaths: Iterable<string>;
  },
  timestamp = new Date().toISOString(),
): RuntimeFinalizeTransition {
  return {
    action: "finalize",
    reason: {
      code: "finalize.completed",
      changedPaths: takeLastUnique([...input.changedPaths]),
    },
    timestamp,
  };
}

export function createExecutionWaitYieldTransition(
  input: {
    executionIds: Iterable<string>;
    toolNames: Iterable<string>;
  },
  timestamp = new Date().toISOString(),
): RuntimeYieldTransition {
  return {
    action: "yield",
    reason: {
      code: "yield.execution_wait",
      executionIds: takeLastUnique([...input.executionIds]),
      toolNames: takeLastUnique([...input.toolNames]),
    },
    timestamp,
  };
}

export function buildRunTurnResult(input: {
  session: SessionRecord;
  changedPaths: Iterable<string>;
  transition: RuntimeTerminalTransition;
}): RunTurnResult {
  return {
    session: input.session,
    changedPaths: [...input.changedPaths],
    transition: input.transition,
  };
}
