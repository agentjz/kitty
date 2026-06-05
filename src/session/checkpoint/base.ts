import type { SessionCheckpoint, SessionRecord } from "../../types.js";
import {
  deriveCompletedSteps,
  deriveRecentToolBatchFromMessages,
} from "./derivation.js";
import { fingerprintFocus, normalizeText } from "./shared.js";

export function createEmptyCheckpoint(timestamp = new Date().toISOString()): SessionCheckpoint {
  return {
    version: 1,
    status: "active",
    completedSteps: [],
    flow: {
      phase: "active",
      runState: {
        status: "idle",
        source: "checkpoint",
        pendingToolCallCount: 0,
        updatedAt: timestamp,
      },
      updatedAt: timestamp,
    },
    updatedAt: timestamp,
  };
}

export function createCheckpointForFocus(
  focus: string | undefined,
  timestamp: string,
): SessionCheckpoint {
  return {
    ...createEmptyCheckpoint(timestamp),
    focus,
    focusFingerprint: focus ? fingerprintFocus(focus) : undefined,
  };
}

export function deriveCheckpointFromSession(
  session: SessionRecord,
  timestamp: string,
): SessionCheckpoint {
  const recentToolBatch = deriveRecentToolBatchFromMessages(session.messages, timestamp);

  return {
    ...createCheckpointForFocus(normalizeText(session.taskState?.focus) || undefined, timestamp),
    completedSteps: deriveCompletedSteps(session),
    recentToolBatch,
  };
}
