import type { SessionRecord, StoredMessage, TaskState } from "../types.js";
import { collectActiveFiles, collectBlockers, collectCompletedActions, collectPlannedActions } from "./taskStateHistory.js";
import { createInternalReminder, isInternalMessage, readUserInput } from "./turnFrame.js";

const MAX_ACTIVE_FILES = 12;
const MAX_PLANNED_ACTIONS = 8;
const MAX_COMPLETED_ACTIONS = 12;
const MAX_BLOCKERS = 8;

export function createEmptyTaskState(timestamp = new Date().toISOString()): TaskState {
  return {
    activeFiles: [],
    plannedActions: [],
    completedActions: [],
    blockers: [],
    lastUpdatedAt: timestamp,
  };
}

export function deriveTaskState(messages: StoredMessage[], previous?: TaskState): TaskState {
  const now = new Date().toISOString();
  const currentTurn = findCurrentTurn(messages);
  const frameMessages = currentTurn ? messages.slice(currentTurn.startIndex) : messages;

  return {
    focus: previous?.focus,
    activeFiles: takeLastUnique(collectActiveFiles(frameMessages), MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(collectPlannedActions(frameMessages), MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(collectCompletedActions(frameMessages), MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(collectBlockers(frameMessages), MAX_BLOCKERS),
    lastUpdatedAt: now,
  };
}

export function normalizeTaskState(taskState: TaskState | undefined): TaskState | undefined {
  if (!taskState) {
    return undefined;
  }

  return {
    focus: typeof taskState.focus === "string" ? taskState.focus : undefined,
    activeFiles: takeLastUnique(taskState.activeFiles ?? [], MAX_ACTIVE_FILES),
    plannedActions: takeLastUnique(taskState.plannedActions ?? [], MAX_PLANNED_ACTIONS),
    completedActions: takeLastUnique(taskState.completedActions ?? [], MAX_COMPLETED_ACTIONS),
    blockers: takeLastUnique(taskState.blockers ?? [], MAX_BLOCKERS),
    lastUpdatedAt:
      typeof taskState.lastUpdatedAt === "string" && taskState.lastUpdatedAt.length > 0
        ? taskState.lastUpdatedAt
        : new Date().toISOString(),
  };
}

export function formatTaskStateBlock(taskState: TaskState | undefined): string {
  if (!taskState) {
    return "- none";
  }

  const parts = [
    taskState.focus ? `- Focus: ${taskState.focus}` : "- Focus: none",
    `- Planned actions: ${formatList(taskState.plannedActions)}`,
    `- Blockers: ${formatList(taskState.blockers)}`,
    `- Updated at: ${taskState.lastUpdatedAt}`,
  ];

  return parts.join("\n");
}

export { createInternalReminder, isInternalMessage };

export function normalizeSessionRecord(session: SessionRecord): SessionRecord {
  return {
    ...session,
    messageCount: Array.isArray(session.messages) ? session.messages.length : 0,
    messages: Array.isArray(session.messages) ? session.messages : [],
    taskState: normalizeTaskState(deriveTaskState(Array.isArray(session.messages) ? session.messages : [], session.taskState)),
  };
}

export function applyCurrentTurnFrame(
  session: SessionRecord,
  input: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const userInput = readUserInput(input);
  if (!userInput) {
    return {
      ...session,
      taskState: normalizeTaskState(session.taskState ?? createEmptyTaskState(timestamp)),
    };
  }

  return {
    ...session,
    taskState: {
      focus: session.taskState?.focus,
      activeFiles: [],
      plannedActions: [],
      completedActions: [],
      blockers: [],
      lastUpdatedAt: timestamp,
    },
  };
}

function findCurrentTurn(messages: StoredMessage[]): {
  startIndex: number;
} | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") {
      continue;
    }

    const normalized = readUserInput(message.content);
    if (normalized) {
      return {
        startIndex: index,
      };
    }
  }

  return undefined;
}

function takeLastUnique(values: string[], limit: number): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index]?.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.unshift(value);
    if (result.length >= limit) {
      break;
    }
  }

  return result;
}

function formatList(values: string[]): string {
  return values.length > 0 ? values.join(" | ") : "none";
}
