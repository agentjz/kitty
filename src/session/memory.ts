import type { SessionMemoryState, SessionRecord } from "../types.js";

const MAX_SESSION_MEMORY_CHARS = 12_000;

export const SESSION_MEMORY_SECTIONS = [
  {
    title: "Current Focus",
    description: "Model-written current work focus that still affects the next turn.",
  },
  {
    title: "User Constraints",
    description: "Stable user constraints or preferences that affect future action.",
  },
  {
    title: "Decisions",
    description: "Decisions already made that should guide later work.",
  },
  {
    title: "Open Threads",
    description: "Unresolved work, next steps, blockers, or questions.",
  },
  {
    title: "Verification Facts",
    description: "Concrete tool, test, file-change, or runtime facts.",
  },
  {
    title: "Reusable Lessons",
    description: "Stable lessons worth moving into spec notes or skill references.",
  },
] as const;

export function formatSessionMemorySectionTemplate(): string {
  return SESSION_MEMORY_SECTIONS
    .map((section) => `## ${section.title}\n${section.description}\nWrite None when no supplied fact belongs here.`)
    .join("\n\n");
}

export function formatSessionMemorySectionList(): string {
  return SESSION_MEMORY_SECTIONS.map((section) => `- ${section.title}: ${section.description}`).join("\n");
}

export function createSessionMemoryState(summary: string, timestamp = new Date().toISOString()): SessionMemoryState {
  return {
    summary: normalizeSummary(summary),
    updatedAt: timestamp,
  };
}

export function updateSessionMemory(
  session: SessionRecord,
  summary: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  const memory = createSessionMemoryState(summary, timestamp);
  const focus = readSessionMemoryCurrentFocus(memory.summary);
  return {
    ...session,
    sessionMemory: memory,
    taskState: {
      ...(session.taskState ?? {
        activeFiles: [],
        plannedActions: [],
        completedActions: [],
        blockers: [],
        lastUpdatedAt: timestamp,
      }),
      focus,
      lastUpdatedAt: timestamp,
    },
  };
}

export function normalizeSessionMemory(value: unknown, timestamp = new Date().toISOString()): SessionMemoryState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Partial<SessionMemoryState>;
  if (typeof record.summary !== "string") {
    return undefined;
  }

  return {
    summary: normalizeSummary(record.summary),
    updatedAt: typeof record.updatedAt === "string" && record.updatedAt.trim()
      ? record.updatedAt
      : timestamp,
  };
}

function normalizeSummary(value: string): string {
  return value
    .replace(/\r\n/g, "\n")
    .trim()
    .slice(0, MAX_SESSION_MEMORY_CHARS);
}

function readSessionMemoryCurrentFocus(summary: string): string | undefined {
  const lines = summary.split("\n");
  let inFocusSection = false;
  const values: string[] = [];

  for (const line of lines) {
    if (line.startsWith("## ")) {
      if (inFocusSection) {
        break;
      }
      inFocusSection = line.slice(3).trim() === "Current Focus";
      continue;
    }

    if (inFocusSection) {
      values.push(line);
    }
  }

  const focus = values.join("\n").trim();
  return focus && focus.toLowerCase() !== "none" ? focus : undefined;
}
