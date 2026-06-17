import type {
  SessionRecord,
  StoredMessage,
  ToolCallRecord,
} from "../types.js";
import { normalizeSessionCheckpoint } from "./checkpoint.js";
import { normalizeSessionMemory } from "./memory.js";
import { normalizeSessionDiffState } from "./sessionDiff.js";
import { normalizeSessionWorkset } from "./workset.js";
import {
  createInvalidSessionJsonError,
  createSessionCorruptError,
  createUnsupportedSessionSchemaError,
} from "./errors.js";
import { deriveTaskState, normalizeSessionRecord as normalizeTaskStateSessionRecord } from "./taskState.js";
import { deriveTodoItems, normalizeSessionTodos, normalizeTodoItems } from "./todos.js";

const CURRENT_SESSION_SCHEMA_VERSION = 1;
const SESSION_SNAPSHOT_KEYS = new Set([
  "schemaVersion",
  "id",
  "createdAt",
  "updatedAt",
  "cwd",
  "title",
  "messageCount",
  "messages",
  "sessionMemory",
  "todoItems",
  "taskState",
  "checkpoint",
  "sessionDiff",
  "contextBudget",
  "workset",
]);

type SessionSnapshotCandidate = Partial<SessionRecord> & {
  schemaVersion?: unknown;
};

export function serializeSessionSnapshot(session: SessionRecord): string {
  return `${JSON.stringify({
    schemaVersion: CURRENT_SESSION_SCHEMA_VERSION,
    ...session,
  }, null, 2)}\n`;
}

export function parseSessionSnapshot(raw: string, sessionPath: string): SessionRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw createInvalidSessionJsonError(sessionPath, error);
    }
    throw error;
  }

  const record = expectRecord(parsed, sessionPath, "Session snapshot");
  rejectUnknownSessionKeys(record, sessionPath);
  const schemaVersion = record.schemaVersion;
  if (schemaVersion !== CURRENT_SESSION_SCHEMA_VERSION) {
    throw createUnsupportedSessionSchemaError(sessionPath, schemaVersion, CURRENT_SESSION_SCHEMA_VERSION);
  }

  const candidate: SessionSnapshotCandidate = {
    id: readRequiredString(record, "id", sessionPath),
    createdAt: readRequiredString(record, "createdAt", sessionPath),
    updatedAt: readRequiredString(record, "updatedAt", sessionPath),
    cwd: readRequiredString(record, "cwd", sessionPath),
    title: readOptionalString(record.title, "title", sessionPath),
    messageCount: typeof record.messageCount === "number" ? Math.trunc(record.messageCount) : 0,
    messages: readMessages(record.messages, sessionPath),
    sessionMemory: normalizeSessionMemory(record.sessionMemory),
    todoItems: readTodoItems(record.todoItems, sessionPath),
    taskState: readOptionalObject(record.taskState, "taskState", sessionPath) as SessionRecord["taskState"],
    checkpoint: readOptionalObject(record.checkpoint, "checkpoint", sessionPath) as SessionRecord["checkpoint"],
    sessionDiff: readOptionalObject(record.sessionDiff, "sessionDiff", sessionPath) as SessionRecord["sessionDiff"],
    contextBudget: readContextBudget(record.contextBudget, sessionPath),
    workset: normalizeSessionWorkset(record.workset),
  };

  return normalizeLoadedSessionRecord(candidate as SessionRecord);
}

export function prepareSessionRecordForSave(session: SessionRecord): SessionRecord {
  const normalizedMessages = Array.isArray(session.messages) ? session.messages : [];
  const prepared = {
    ...session,
    updatedAt: new Date().toISOString(),
    title: session.title,
    messageCount: normalizedMessages.length,
    messages: normalizedMessages,
    sessionMemory: normalizeSessionMemory(session.sessionMemory),
    todoItems: deriveTodoItems(normalizedMessages, session.todoItems ?? []),
    taskState: deriveTaskState(normalizedMessages, session.taskState),
  };

  return normalizeSessionDiffState(normalizeSessionCheckpoint({
    ...prepared,
    workset: normalizeSessionWorkset(prepared.workset),
  }));
}

export function normalizeLoadedSessionRecord(session: SessionRecord): SessionRecord {
  return normalizeSessionDiffState(normalizeSessionCheckpoint(
    normalizeSessionTodos(normalizeTaskStateSessionRecord(session)),
  ));
}

function rejectUnknownSessionKeys(record: Record<string, unknown>, sessionPath: string): void {
  const unknownKeys = Object.keys(record).filter((key) => !SESSION_SNAPSHOT_KEYS.has(key));
  if (unknownKeys.length > 0) {
    throw createSessionCorruptError(sessionPath, `unrecognized field(s): ${unknownKeys.join(", ")}`);
  }
}

function readMessages(value: unknown, sessionPath: string): StoredMessage[] {
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, "messages must be an array");
  }

  return value.map((entry, index) => readMessage(entry, index, sessionPath));
}

function readTodoItems(value: unknown, sessionPath: string): SessionRecord["todoItems"] {
  if (value === undefined) {
    return undefined;
  }

  try {
    return normalizeTodoItems(value);
  } catch (error) {
    throw createSessionCorruptError(sessionPath, error instanceof Error ? error.message : String(error));
  }
}

function readContextBudget(value: unknown, sessionPath: string): SessionRecord["contextBudget"] {
  if (value === undefined) {
    return undefined;
  }
  const record = expectRecord(value, sessionPath, "contextBudget");
  const version = record.version;
  if (version !== 1) {
    throw createSessionCorruptError(sessionPath, "contextBudget.version must be 1");
  }
  const compressionMode = readRequiredString(record, "compressionMode", sessionPath, "contextBudget");
  if (compressionMode !== "none" && compressionMode !== "normal" && compressionMode !== "aggressive" && compressionMode !== "hard") {
    throw createSessionCorruptError(sessionPath, "contextBudget.compressionMode must be one of none|normal|aggressive|hard");
  }
  return {
    version,
    limitChars: readRequiredNumber(record, "limitChars", sessionPath, "contextBudget"),
    estimatedChars: readRequiredNumber(record, "estimatedChars", sessionPath, "contextBudget"),
    remainingChars: readRequiredNumber(record, "remainingChars", sessionPath, "contextBudget"),
    usageRatio: readRequiredNumber(record, "usageRatio", sessionPath, "contextBudget"),
    compressed: readRequiredBoolean(record, "compressed", sessionPath, "contextBudget"),
    compressionMode,
    compressionReason: readRequiredString(record, "compressionReason", sessionPath, "contextBudget"),
    sources: readContextBudgetSources(record.sources, sessionPath),
    promptHotspots: readContextBudgetHotspots(record.promptHotspots, sessionPath),
    cacheLayout: readContextCacheLayout(record.cacheLayout, sessionPath),
  };
}

function readContextCacheLayout(value: unknown, sessionPath: string): NonNullable<SessionRecord["contextBudget"]>["cacheLayout"] {
  if (value === undefined) {
    return undefined;
  }
  const record = expectRecord(value, sessionPath, "contextBudget.cacheLayout");
  return {
    stablePrefixFingerprint: readRequiredString(record, "stablePrefixFingerprint", sessionPath, "contextBudget.cacheLayout"),
    volatileTailFingerprint: readRequiredString(record, "volatileTailFingerprint", sessionPath, "contextBudget.cacheLayout"),
    stablePrefixChars: readRequiredNumber(record, "stablePrefixChars", sessionPath, "contextBudget.cacheLayout"),
    volatileTailChars: readRequiredNumber(record, "volatileTailChars", sessionPath, "contextBudget.cacheLayout"),
    stableSources: readStringArray(record.stableSources, sessionPath, "contextBudget.cacheLayout.stableSources"),
    volatileSources: readStringArray(record.volatileSources, sessionPath, "contextBudget.cacheLayout.volatileSources"),
  };
}

function readContextBudgetSources(value: unknown, sessionPath: string): NonNullable<SessionRecord["contextBudget"]>["sources"] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, "contextBudget.sources must be an array");
  }
  return value.map((entry, index) => {
    const record = expectRecord(entry, sessionPath, `contextBudget.sources[${index}]`);
    const name = readRequiredString(record, "name", sessionPath, `contextBudget.sources[${index}]`);
    if (name !== "systemPrompt" && name !== "nearFieldConversation" && name !== "conversationSummary" && name !== "compactedConversation") {
      throw createSessionCorruptError(sessionPath, `contextBudget.sources[${index}].name is invalid`);
    }
    const messages = record.messages === undefined
      ? undefined
      : readRequiredNumber(record, "messages", sessionPath, `contextBudget.sources[${index}]`);
    return {
      name,
      chars: readRequiredNumber(record, "chars", sessionPath, `contextBudget.sources[${index}]`),
      messages,
    };
  });
}

function readContextBudgetHotspots(value: unknown, sessionPath: string): NonNullable<SessionRecord["contextBudget"]>["promptHotspots"] {
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, "contextBudget.promptHotspots must be an array");
  }
  return value.map((entry, index) => {
    const record = expectRecord(entry, sessionPath, `contextBudget.promptHotspots[${index}]`);
    const layer = readRequiredString(record, "layer", sessionPath, `contextBudget.promptHotspots[${index}]`);
    if (layer !== "static" && layer !== "profile" && layer !== "runtimeFacts") {
      throw createSessionCorruptError(sessionPath, `contextBudget.promptHotspots[${index}].layer must be one of static|profile|runtimeFacts`);
    }
    return {
      layer,
      title: readRequiredString(record, "title", sessionPath, `contextBudget.promptHotspots[${index}]`),
      chars: readRequiredNumber(record, "chars", sessionPath, `contextBudget.promptHotspots[${index}]`),
      lines: readRequiredNumber(record, "lines", sessionPath, `contextBudget.promptHotspots[${index}]`),
    };
  });
}

function readStringArray(value: unknown, sessionPath: string, scope: string): string[] {
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, `${scope} must be an array`);
  }
  return value.map((entry, index) => {
    if (typeof entry !== "string") {
      throw createSessionCorruptError(sessionPath, `${scope}[${index}] must be a string`);
    }
    return entry;
  });
}

function readMessage(value: unknown, index: number, sessionPath: string): StoredMessage {
  const record = expectRecord(value, sessionPath, `messages[${index}]`);
  const role = readRequiredString(record, "role", sessionPath, `messages[${index}]`);
  if (role !== "system" && role !== "user" && role !== "assistant" && role !== "tool") {
    throw createSessionCorruptError(sessionPath, `messages[${index}].role must be one of system|user|assistant|tool`);
  }

  return {
    role,
    content: readMessageContent(record.content, sessionPath, `messages[${index}]`),
    source: readMessageSource(record.source, sessionPath, `messages[${index}]`),
    name: readOptionalString(record.name, "name", sessionPath, `messages[${index}]`),
    tool_call_id: readOptionalString(record.tool_call_id, "tool_call_id", sessionPath, `messages[${index}]`),
    tool_calls: readToolCalls(record.tool_calls, sessionPath, index),
    reasoningContent: readOptionalString(record.reasoningContent, "reasoningContent", sessionPath, `messages[${index}]`),
    createdAt: readRequiredString(record, "createdAt", sessionPath, `messages[${index}]`),
  };
}

function readMessageContent(
  value: unknown,
  sessionPath: string,
  scope: string,
): string | null {
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw createSessionCorruptError(sessionPath, `${scope}.content must be a string or null`);
  }

  return value;
}

function readToolCalls(value: unknown, sessionPath: string, index: number): ToolCallRecord[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, `messages[${index}].tool_calls must be an array`);
  }

  return value.map((entry, toolIndex) => {
    const record = expectRecord(entry, sessionPath, `messages[${index}].tool_calls[${toolIndex}]`);
    const type = readRequiredString(record, "type", sessionPath, `messages[${index}].tool_calls[${toolIndex}]`);
    if (type !== "function") {
      throw createSessionCorruptError(sessionPath, `messages[${index}].tool_calls[${toolIndex}].type must be 'function'`);
    }
    const fn = readOptionalObject(record.function, "function", sessionPath, `messages[${index}].tool_calls[${toolIndex}]`);
    if (!fn) {
      throw createSessionCorruptError(sessionPath, `messages[${index}].tool_calls[${toolIndex}].function is required`);
    }
    return {
      id: readRequiredString(record, "id", sessionPath, `messages[${index}].tool_calls[${toolIndex}]`),
      type,
      function: {
        name: readRequiredString(fn, "name", sessionPath, `messages[${index}].tool_calls[${toolIndex}].function`),
        arguments: readRequiredString(fn, "arguments", sessionPath, `messages[${index}].tool_calls[${toolIndex}].function`),
      },
    };
  });
}

function readOptionalObject(
  value: unknown,
  fieldName: string,
  sessionPath: string,
  scope?: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectRecord(value, sessionPath, scope ? `${scope}.${fieldName}` : fieldName);
}

function expectRecord(
  value: unknown,
  sessionPath: string,
  label: string,
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw createSessionCorruptError(sessionPath, `${label} must be an object`);
  }

  return value as Record<string, unknown>;
}

function readRequiredString(
  record: Record<string, unknown>,
  key: string,
  sessionPath: string,
  scope?: string,
): string {
  const value = readOptionalString(record[key], key, sessionPath, scope);
  if (!value) {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} is required`);
  }
  return value;
}

function readMessageSource(
  value: unknown,
  sessionPath: string,
  scope: string,
): StoredMessage["source"] | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "external" && value !== "internal") {
    throw createSessionCorruptError(sessionPath, `${scope}.source must be external or internal`);
  }

  return value;
}

function readRequiredNumber(
  record: Record<string, unknown>,
  key: string,
  sessionPath: string,
  scope?: string,
): number {
  const value = record[key];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} must be a finite number`);
  }
  return value;
}

function readRequiredBoolean(
  record: Record<string, unknown>,
  key: string,
  sessionPath: string,
  scope?: string,
): boolean {
  const value = record[key];
  if (typeof value !== "boolean") {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} must be a boolean`);
  }
  return value;
}

function readOptionalString(
  value: unknown,
  key: string,
  sessionPath: string,
  scope?: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw createSessionCorruptError(sessionPath, `${scope ? `${scope}.` : ""}${key} must be a string`);
  }

  return value;
}

export { CURRENT_SESSION_SCHEMA_VERSION };
