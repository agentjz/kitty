import crypto from "node:crypto";
import path from "node:path";

import { ControlPlaneLedger } from "../control/ledger.js";
import { SessionRevisionConflictError } from "../control/sessions.js";
import type { SessionRecord, StoredMessage } from "../types.js";
import { createEmptyCheckpoint } from "./checkpoint.js";
import { createEmptyTaskState } from "./taskState.js";
import { createEmptySessionDiff } from "./sessionDiff.js";
import { createSessionNotFoundError } from "./errors.js";
import { prepareSessionRecordForSave } from "./snapshot.js";
import { createToolMessage } from "./messages.js";

export interface SkippedSessionSnapshot {
  path?: string;
  code: string;
  error: string;
}

export interface SessionStoreLike {
  create(cwd: string): Promise<SessionRecord>;
  save(session: SessionRecord): Promise<SessionRecord>;
  load(id: string): Promise<SessionRecord>;
  loadLatest(): Promise<SessionRecord | null>;
  list(limit?: number): Promise<SessionRecord[]>;
  listReadable?(limit?: number): Promise<{
    sessions: SessionRecord[];
    skipped: SkippedSessionSnapshot[];
  }>;
  appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord>;
}

export class SessionStore implements SessionStoreLike {
  private readonly rootDir: string;

  constructor(private readonly sessionsDir: string) {
    this.rootDir = resolveLedgerRoot(sessionsDir);
  }

  async create(cwd: string): Promise<SessionRecord> {
    return createSessionRecord(cwd);
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const updated = prepareSessionRecordForSave(session);
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.sessions.save(updated);
    } finally {
      ledger.close();
    }
  }

  async load(id: string): Promise<SessionRecord> {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      let session = ledger.sessions.load(id);
      if (!session) throw createSessionNotFoundError(id, `sqlite:${id}`);
      session = recoverDurableToolResults(ledger, session);
      return prepareSessionRecordForSave(session, false);
    } finally {
      ledger.close();
    }
  }

  async loadLatest(): Promise<SessionRecord | null> {
    const sessions = await this.list(1);
    return sessions[0] ?? null;
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    return (await this.listReadable(limit)).sessions;
  }

  async listReadable(limit = 20): Promise<{
    sessions: SessionRecord[];
    skipped: SkippedSessionSnapshot[];
  }> {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return { sessions: ledger.sessions.list(limit), skipped: [] };
    } finally {
      ledger.close();
    }
  }

  async appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord> {
    const next = {
      ...session,
      messages: [...session.messages, ...messages],
    };
    return this.save(next);
  }

}

export class InProcessSessionStore implements SessionStoreLike {
  private readonly sessions = new Map<string, SessionRecord>();

  async create(cwd: string): Promise<SessionRecord> {
    return createSessionRecord(cwd);
  }

  async save(session: SessionRecord): Promise<SessionRecord> {
    const existing = this.sessions.get(session.id);
    if (existing && existing.revision !== session.revision) {
      throw new SessionRevisionConflictError(session.id, session.revision, existing.revision);
    }
    const prepared = prepareSessionRecordForSave(session);
    prepared.revision = (existing?.revision ?? session.revision) + 1;
    this.sessions.set(prepared.id, prepared);
    return prepared;
  }

  async load(id: string): Promise<SessionRecord> {
    const session = this.sessions.get(id);
    if (!session) {
      throw createSessionNotFoundError(id, `in-process:${id}`);
    }

    return session;
  }

  async loadLatest(): Promise<SessionRecord | null> {
    const sessions = await this.list(1);
    return sessions[0] ?? null;
  }

  async list(limit = 20): Promise<SessionRecord[]> {
    return [...this.sessions.values()]
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, limit);
  }

  async listReadable(limit = 20): Promise<{
    sessions: SessionRecord[];
    skipped: SkippedSessionSnapshot[];
  }> {
    return {
      sessions: await this.list(limit),
      skipped: [],
    };
  }

  async appendMessages(session: SessionRecord, messages: StoredMessage[]): Promise<SessionRecord> {
    return this.save({
      ...session,
      messages: [...session.messages, ...messages],
    });
  }
}

export async function createSessionRecord(cwd: string): Promise<SessionRecord> {
  const timestamp = new Date().toISOString();
  const id = createSessionId();
  return prepareSessionRecordForSave({
    id,
    revision: 0,
    createdAt: timestamp,
    updatedAt: timestamp,
    cwd,
    messageCount: 0,
    messages: [],
    taskState: createEmptyTaskState(timestamp),
    checkpoint: createEmptyCheckpoint(timestamp),
    sessionDiff: createEmptySessionDiff(timestamp),
  });
}

function resolveLedgerRoot(sessionsDir: string): string {
  const parent = path.dirname(path.resolve(sessionsDir));
  return path.basename(parent).toLowerCase() === ".kitty" ? path.dirname(parent) : parent;
}

function recoverDurableToolResults(ledger: ControlPlaneLedger, session: SessionRecord): SessionRecord {
  ledger.toolCalls.interruptRecoverable(session.id);
  const recordedToolCallIds = new Set(
    session.messages
      .filter((message) => message.role === "tool" && message.tool_call_id)
      .map((message) => message.tool_call_id!),
  );
  const recoveredMessages = ledger.toolCalls.listBySession(session.id)
    .filter((toolCall) => toolCall.result && !recordedToolCallIds.has(toolCall.callId))
    .map((toolCall) => createToolMessage(
      toolCall.callId,
      toolCall.result!.modelView,
      toolCall.toolName,
      toolCall.result,
    ));
  if (recoveredMessages.length === 0) return session;
  return ledger.sessions.save(prepareSessionRecordForSave({
    ...session,
    messages: [...session.messages, ...recoveredMessages],
  }));
}

function createSessionId(): string {
  const date = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const random = crypto.randomUUID().slice(0, 8);
  return `${date}-${random}`;
}
