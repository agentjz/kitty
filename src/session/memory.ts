import type { SessionMemoryState, SessionRecord } from "../types.js";

const MAX_SESSION_MEMORY_CHARS = 12_000;

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
