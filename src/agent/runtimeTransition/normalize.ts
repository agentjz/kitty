import type {
  RuntimeContinueTransition,
  RuntimeFinalizeTransition,
  RuntimeTransition,
  RuntimeYieldTransition,
} from "../../types.js";
import {
  clampWholeNumber,
  normalizeText,
  normalizeTimestamp,
  takeLastUnique,
  truncate,
} from "./shared.js";

export function normalizeRuntimeTransition(
  transition: RuntimeTransition | undefined,
  timestamp = new Date().toISOString(),
): RuntimeTransition | undefined {
  if (!transition || typeof transition !== "object") {
    return undefined;
  }

  const action = normalizeAction(transition.action);
  const reason = transition.reason;
  const normalizedTimestamp = normalizeTimestamp(transition.timestamp, timestamp);
  if (!reason || typeof reason !== "object") {
    return undefined;
  }

  switch (action) {
    case "continue":
      return normalizeContinueTransition(reason as RuntimeContinueTransition["reason"], normalizedTimestamp);
    case "finalize":
      return normalizeFinalizeTransition(reason as RuntimeFinalizeTransition["reason"], normalizedTimestamp);
    case "yield":
      return normalizeYieldTransition(reason as RuntimeYieldTransition["reason"], normalizedTimestamp);
    default:
      return undefined;
  }
}

function normalizeContinueTransition(
  reason: RuntimeContinueTransition["reason"],
  timestamp: string,
): RuntimeContinueTransition | undefined {
  switch (reason.code) {
    case "continue.after_tool_batch": {
      const toolNames = takeLastUnique(reason.toolNames);
      if (toolNames.length === 0) {
        return undefined;
      }
      return {
        action: "continue",
        reason: {
          code: reason.code,
          toolNames,
          changedPaths: takeLastUnique(reason.changedPaths ?? []),
        },
        timestamp,
      };
    }
    case "continue.empty_assistant_response":
      return {
        action: "continue",
        reason: {
          code: reason.code,
        },
        timestamp,
      };
    default:
      return undefined;
  }
}

function normalizeFinalizeTransition(
  reason: RuntimeFinalizeTransition["reason"],
  timestamp: string,
): RuntimeFinalizeTransition | undefined {
  if (reason.code !== "finalize.completed") {
    return undefined;
  }

  return {
    action: "finalize",
    reason: {
      code: reason.code,
      changedPaths: takeLastUnique(reason.changedPaths ?? []),
    },
    timestamp,
  };
}

function normalizeYieldTransition(
  reason: RuntimeYieldTransition["reason"],
  timestamp: string,
): RuntimeYieldTransition | undefined {
  if (reason.code !== "yield.execution_wait") {
    return undefined;
  }

  const executionIds = takeLastUnique(reason.executionIds ?? []);
  if (executionIds.length === 0) {
    return undefined;
  }

  return {
    action: "yield",
    reason: {
      code: reason.code,
      executionIds,
      toolNames: takeLastUnique(reason.toolNames ?? []),
    },
    timestamp,
  };
}

function normalizeAction(value: unknown): RuntimeTransition["action"] | undefined {
  return value === "continue" || value === "finalize" || value === "yield"
    ? value
    : undefined;
}
