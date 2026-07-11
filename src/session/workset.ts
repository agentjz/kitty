import path from "node:path";

import type { SessionRecord, SessionWorksetEntry, SessionWorksetState } from "../types.js";

const MAX_WORKSET_FILES = 20;

export interface RecordWorksetFileInput {
  path: string;
  cwd: string;
  toolName: string;
  changed: boolean;
  changeId?: string;
  reason?: string;
  timestamp?: string;
}

export function createEmptySessionWorkset(timestamp = new Date().toISOString()): SessionWorksetState {
  return {
    files: [],
    updatedAt: timestamp,
  };
}

export function normalizeSessionWorkset(value: unknown): SessionWorksetState | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return createEmptySessionWorkset();
  }
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.files)) {
    return createEmptySessionWorkset();
  }
  const files = record.files
    .map(normalizeWorksetEntry)
    .filter((entry): entry is SessionWorksetEntry => Boolean(entry))
    .slice(-MAX_WORKSET_FILES);
  return {
    files,
    updatedAt: typeof record.updatedAt === "string" ? record.updatedAt : latestWorksetTimestamp(files),
  };
}

export function recordSessionWorksetFile(
  session: SessionRecord,
  input: RecordWorksetFileInput,
): SessionRecord {
  const timestamp = input.timestamp ?? new Date().toISOString();
  const workset = normalizeSessionWorkset(session.workset) ?? createEmptySessionWorkset(timestamp);
  const displayPath = normalizeDisplayPath(input.cwd, input.path);
  const existing = workset.files.find((entry) => entry.path === displayPath);
  const nextEntry: SessionWorksetEntry = existing
    ? {
        ...existing,
        lastSeenAt: timestamp,
        readCount: existing.readCount + (input.changed ? 0 : 1),
        changedCount: existing.changedCount + (input.changed ? 1 : 0),
        lastTool: input.toolName,
        lastChangeId: input.changeId ?? existing.lastChangeId,
        reason: input.reason ?? existing.reason,
      }
    : {
        path: displayPath,
        firstSeenAt: timestamp,
        lastSeenAt: timestamp,
        readCount: input.changed ? 0 : 1,
        changedCount: input.changed ? 1 : 0,
        lastTool: input.toolName,
        lastChangeId: input.changeId,
        reason: input.reason,
      };

  const files = [
    ...workset.files.filter((entry) => entry.path !== displayPath),
    nextEntry,
  ].slice(-MAX_WORKSET_FILES);

  return {
    ...session,
    workset: {
      files,
      updatedAt: timestamp,
    },
  };
}

export function formatWorksetFileLine(entry: SessionWorksetEntry): string {
  return [
    entry.path,
    `read=${entry.readCount}`,
    `changed=${entry.changedCount}`,
    `last=${entry.lastTool}`,
    entry.lastChangeId ? `change=${entry.lastChangeId}` : undefined,
    entry.reason ? `reason=${entry.reason}` : undefined,
  ].filter(Boolean).join("  ");
}

function normalizeWorksetEntry(value: unknown): SessionWorksetEntry | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const filePath = typeof record.path === "string" ? record.path.trim() : "";
  if (!filePath) {
    return undefined;
  }
  return {
    path: filePath,
    firstSeenAt: readString(record.firstSeenAt),
    lastSeenAt: readString(record.lastSeenAt),
    readCount: readCount(record.readCount),
    changedCount: readCount(record.changedCount),
    lastTool: typeof record.lastTool === "string" && record.lastTool.trim() ? record.lastTool.trim() : "unknown",
    lastChangeId: typeof record.lastChangeId === "string" && record.lastChangeId.trim() ? record.lastChangeId.trim() : undefined,
    reason: typeof record.reason === "string" && record.reason.trim() ? record.reason.trim() : undefined,
  };
}

function normalizeDisplayPath(cwd: string, targetPath: string): string {
  const absolutePath = path.resolve(cwd, targetPath);
  const relative = path.relative(cwd, absolutePath);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative)
    ? relative
    : absolutePath;
}

function readString(value: unknown): string {
  return typeof value === "string" && value.trim() ? value : new Date().toISOString();
}

function readCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0;
}

function latestWorksetTimestamp(files: readonly SessionWorksetEntry[]): string {
  return files.map((entry) => entry.lastSeenAt).sort().at(-1) ?? new Date().toISOString();
}
