import type { SessionMemoryState, SessionRecord } from "../types.js";

const MAX_SESSION_MEMORY_CHARS = 12_000;

export const SESSION_MEMORY_SECTIONS = [
  {
    title: "Current Objective",
    description: "Current objective that still affects the next turn.",
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
    version: 1,
    summary: normalizeSummary(summary),
    updatedAt: timestamp,
  };
}

export function updateSessionMemory(
  session: SessionRecord,
  summary: string,
  timestamp = new Date().toISOString(),
): SessionRecord {
  return {
    ...session,
    sessionMemory: createSessionMemoryState(summary, timestamp),
  };
}

export function normalizeSessionMemory(value: unknown, timestamp = new Date().toISOString()): SessionMemoryState | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Partial<SessionMemoryState>;
  if (record.version !== 1 || typeof record.summary !== "string") {
    return undefined;
  }

  return {
    version: 1,
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
