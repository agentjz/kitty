import { normalizeCheckpoint } from "../../../session/checkpoint.js";
import { fingerprintFocus, normalizeText, takeLastUnique } from "../../../session/checkpoint/shared.js";
import { normalizeTodoItems } from "../../../session/todos.js";
import type { SessionCheckpoint, TaskState, TodoItem } from "../../../types.js";
import type { AgentWorkingMemory } from "./types.js";

const MAX_ACTIVE_FILES = 10;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 8;
const MAX_BLOCKERS = 6;
const MAX_TODOS = 12;

export interface BuildWorkingMemoryInput {
  taskState?: TaskState;
  todoItems?: TodoItem[];
  checkpoint?: SessionCheckpoint;
  timestamp?: string;
}

export function buildAgentWorkingMemory(input: BuildWorkingMemoryInput): AgentWorkingMemory {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const focus = normalizeText(input.taskState?.focus) || undefined;
  const checkpoint = normalizeCurrentFocusCheckpoint(input.checkpoint, focus, timestamp);

  return {
    version: 1,
    focus,
    focusFingerprint: focus ? fingerprintFocus(focus) : undefined,
    activeFiles: takeLastUnique(input.taskState?.activeFiles ?? [], MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(input.taskState?.plannedActions ?? [], MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(
      checkpoint?.completedSteps.length ? checkpoint.completedSteps : input.taskState?.completedActions ?? [],
      MAX_COMPLETED_ACTIONS,
    ),
    blockers: takeLastUnique(input.taskState?.blockers ?? [], MAX_BLOCKERS),
    todos: normalizeTodoItems(input.todoItems).slice(0, MAX_TODOS),
    recentToolBatch: checkpoint?.recentToolBatch
      ? {
          tools: checkpoint.recentToolBatch.tools,
          summary: checkpoint.recentToolBatch.summary,
          changedPaths: checkpoint.recentToolBatch.changedPaths,
          recordedAt: checkpoint.recentToolBatch.recordedAt,
        }
      : undefined,
    checkpointPhase: checkpoint?.flow.reason
      ? `${checkpoint.flow.phase} (${checkpoint.flow.reason})`
      : checkpoint?.flow.phase,
    checkpointStatus: checkpoint?.status,
    updatedAt: latestTimestamp([
      input.taskState?.lastUpdatedAt,
      checkpoint?.updatedAt,
      timestamp,
    ]),
  };
}

function normalizeCurrentFocusCheckpoint(
  checkpoint: SessionCheckpoint | undefined,
  focus: string | undefined,
  timestamp: string,
): SessionCheckpoint | undefined {
  const normalized = normalizeCheckpoint(checkpoint, timestamp);
  if (!normalized || normalized.status === "completed") {
    return undefined;
  }
  if (!focus) {
    return normalized.focus ? undefined : normalized;
  }

  return normalized.focusFingerprint === fingerprintFocus(focus)
    ? normalized
    : undefined;
}

function latestTimestamp(values: Array<string | undefined>): string {
  return values
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) ?? new Date().toISOString();
}
