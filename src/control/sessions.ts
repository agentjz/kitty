import crypto from "node:crypto";
import type Database from "better-sqlite3";

import type { SessionRecord, StoredMessage } from "../types.js";

interface SessionRow {
  id: string;
  revision: number;
  created_at: string;
  updated_at: string;
  cwd: string;
  title: string | null;
  state_json: string;
}

interface MessageRow {
  message_json: string;
}

export class SessionRevisionConflictError extends Error {
  constructor(readonly sessionId: string, readonly expected: number, readonly actual: number) {
    super(`Session ${sessionId} revision conflict: expected ${expected}, current ${actual}.`);
    this.name = "SessionRevisionConflictError";
  }
}

export class SessionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  save(session: SessionRecord): SessionRecord {
    return this.db.transaction(() => {
      const existing = this.loadRow(session.id);
      if (existing && existing.revision !== session.revision) {
        throw new SessionRevisionConflictError(session.id, session.revision, existing.revision);
      }

      const revision = existing ? existing.revision + 1 : Math.max(1, session.revision + 1);
      const persisted = { ...session, revision };
      const state = { ...persisted, messages: undefined };
      this.db.prepare(`
        INSERT INTO sessions (id, revision, created_at, updated_at, cwd, title, state_json)
        VALUES (@id, @revision, @createdAt, @updatedAt, @cwd, @title, @stateJson)
        ON CONFLICT(id) DO UPDATE SET
          revision=excluded.revision,
          updated_at=excluded.updated_at,
          cwd=excluded.cwd,
          title=excluded.title,
          state_json=excluded.state_json
      `).run({
        id: persisted.id,
        revision,
        createdAt: persisted.createdAt,
        updatedAt: persisted.updatedAt,
        cwd: persisted.cwd,
        title: persisted.title,
        stateJson: JSON.stringify(state),
      });

      const currentCount = this.messageCount(session.id);
      const currentIds = new Set(this.listMessageIds(session.id));
      for (let index = 0; index < persisted.messages.length; index += 1) {
        const message = ensureMessageId(persisted.messages[index]!);
        persisted.messages[index] = message;
        if (currentIds.has(message.id)) continue;
        if (index < currentCount) {
          throw new Error(`Session ${session.id} message history is not append-only at index ${index}.`);
        }
        this.db.prepare(`
          INSERT INTO session_messages (id, session_id, sequence, message_json, created_at)
          VALUES (?, ?, ?, ?, ?)
        `).run(message.id, session.id, index, JSON.stringify(message), message.createdAt);
      }
      return persisted;
    })();
  }

  load(id: string): SessionRecord | undefined {
    const row = this.loadRow(id);
    return row ? this.fromRow(row) : undefined;
  }

  list(limit: number): SessionRecord[] {
    const rows = this.db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC LIMIT ?").all(limit);
    return (rows as SessionRow[])
      .map((row) => this.fromRow(row));
  }

  private loadRow(id: string): SessionRow | undefined {
    return this.db.prepare("SELECT * FROM sessions WHERE id = ?").get(id) as SessionRow | undefined;
  }

  private fromRow(row: SessionRow): SessionRecord {
    const state = JSON.parse(row.state_json) as SessionRecord;
    return {
      ...state,
      id: row.id,
      revision: row.revision,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      cwd: row.cwd,
      title: row.title ?? undefined,
      messages: (this.db.prepare(
        "SELECT message_json FROM session_messages WHERE session_id = ? ORDER BY sequence ASC",
      ).all(row.id) as MessageRow[]).map((message) => JSON.parse(message.message_json) as StoredMessage),
    };
  }

  private messageCount(sessionId: string): number {
    return Number((this.db.prepare(
      "SELECT COUNT(*) AS count FROM session_messages WHERE session_id = ?",
    ).get(sessionId) as { count: number }).count);
  }

  private listMessageIds(sessionId: string): string[] {
    return (this.db.prepare(
      "SELECT id FROM session_messages WHERE session_id = ? ORDER BY sequence ASC",
    ).all(sessionId) as Array<{ id: string }>).map((row) => row.id);
  }
}

function ensureMessageId(message: StoredMessage): StoredMessage & { id: string } {
  return { ...message, id: message.id ?? `msg-${crypto.randomUUID()}` };
}
