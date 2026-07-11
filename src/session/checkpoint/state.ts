import {
  buildCheckpointFlow,
  createToolBatchTransition,
  getTurnInputTransition,
  normalizeCheckpointFlow,
} from "../../agent/runtimeTransition.js";
import type { SessionCheckpoint, SessionRecord, StoredMessage } from "../../types.js";
import { createCheckpointForFocus, createEmptyCheckpoint, deriveCheckpointFromSession } from "./base.js";
import {
  buildToolBatch,
  deriveCompletedSteps,
} from "./derivation.js";
import {
  fingerprintFocus,
  normalizeText,
  normalizeTimestamp,
  normalizeToolBatch,
  takeLastUnique,
} from "./shared.js";

export { createEmptyCheckpoint } from "./base.js";

interface ToolBatchUpdateInput {
  toolNames: string[];
  toolMessages: StoredMessage[];
  changedPaths?: string[];
}

export function normalizeCheckpoint(
  checkpoint: SessionCheckpoint | undefined,
  timestamp = new Date().toISOString(),
): SessionCheckpoint | undefined {
  if (!checkpoint) {
    return undefined;
  }

  const focus = normalizeText(checkpoint.focus) || undefined;
  const status = checkpoint.status === "completed" ? "completed" : "active";

  return {
    focus,
    focusFingerprint:
      normalizeText(checkpoint.focusFingerprint) || (focus ? fingerprintFocus(focus) : undefined),
    status,
    completedSteps: takeLastUnique(checkpoint.completedSteps ?? [], 8),
    recentToolBatch: normalizeToolBatch(checkpoint.recentToolBatch),
    flow: normalizeCheckpointFlow(checkpoint.flow, status, timestamp),
    updatedAt: normalizeTimestamp(checkpoint.updatedAt, timestamp),
  };
}

export function normalizeSessionCheckpoint(session: SessionRecord): SessionRecord {
  const timestamp = new Date().toISOString();
  const normalized = normalizeCheckpoint(session.checkpoint, timestamp);
  const checkpoint = normalized ?? deriveCheckpointFromSession(session, timestamp);

  if (checkpoint.completedSteps.length === 0) {
    checkpoint.completedSteps = deriveCompletedSteps(session);
  }

  checkpoint.flow = normalizeCheckpointFlow(checkpoint.flow, checkpoint.status, timestamp);
  checkpoint.updatedAt = normalizeTimestamp(checkpoint.updatedAt, timestamp);

  return {
    ...session,
    checkpoint,
  };
}

export function noteCheckpointTurnInput(
  session: SessionRecord,
  input: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = normalizeSessionCheckpoint(session).checkpoint ?? createEmptyCheckpoint(timestamp);
  const transition = getTurnInputTransition(input, timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        runState: checkpoint.status === "completed"
          ? {
              status: "idle",
              source: "checkpoint",
            }
          : {
              status: "busy",
              source: "turn",
            },
        defaultPhase: "active",
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}

export function resolveCurrentFocusCheckpoint(
  session: SessionRecord,
  timestamp = new Date().toISOString(),
): SessionCheckpoint {
  const focus = normalizeText(session.taskState?.focus) || undefined;
  const fingerprint = focus ? fingerprintFocus(focus) : undefined;
  const checkpoint = normalizeCheckpoint(session.checkpoint, timestamp) ?? createEmptyCheckpoint(timestamp);

  if (!focus) {
    return checkpoint;
  }

  if (checkpoint.focusFingerprint === fingerprint) {
    return checkpoint;
  }

  return createCheckpointForFocus(focus, timestamp);
}

export function noteCheckpointToolBatch(
  session: SessionRecord,
  input: ToolBatchUpdateInput,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const checkpoint = resolveCurrentFocusCheckpoint(session, timestamp);
  const recentToolBatch = buildToolBatch(input.toolNames, input.toolMessages, input.changedPaths, timestamp);
  const transition = createToolBatchTransition({
    toolNames: input.toolNames,
    changedPaths: input.changedPaths,
  }, timestamp);

  return {
    ...session,
    checkpoint: {
      ...checkpoint,
      completedSteps: deriveCompletedSteps(session),
      recentToolBatch,
      flow: buildCheckpointFlow({
        current: checkpoint.flow,
        status: checkpoint.status,
        transition,
        defaultPhase: checkpoint.flow.phase,
        timestamp,
      }),
      updatedAt: timestamp,
    },
  };
}
