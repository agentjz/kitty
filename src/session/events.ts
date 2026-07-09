import fs from "node:fs/promises";
import path from "node:path";

export type SessionEventType =
  | "session.created"
  | "turn.started"
  | "turn.completed"
  | "turn.failed"
  | "turn.aborted"
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "runtime.ui";

export interface SessionEventRecord {
  id: string;
  type: SessionEventType;
  sessionId: string;
  createdAt: string;
  cwd: string;
  host?: string;
  message?: string;
  details?: Record<string, unknown>;
}

export class SessionEventStore {
  constructor(private readonly eventsDir: string) {}

  async append(event: Omit<SessionEventRecord, "id" | "createdAt"> & { createdAt?: string }): Promise<SessionEventRecord> {
    const record: SessionEventRecord = {
      id: createEventId(),
      createdAt: event.createdAt ?? new Date().toISOString(),
      type: event.type,
      sessionId: event.sessionId,
      cwd: event.cwd,
      host: event.host,
      message: event.message,
      details: event.details,
    };
    await fs.mkdir(this.eventsDir, { recursive: true });
    await fs.appendFile(this.getSessionEventPath(event.sessionId), `${JSON.stringify(record)}\n`, "utf8");
    return record;
  }

  async list(sessionId: string, limit = 100): Promise<SessionEventRecord[]> {
    const filePath = this.getSessionEventPath(sessionId);
    let raw = "";
    try {
      raw = await fs.readFile(filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return [];
      }
      throw error;
    }
    return raw
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line) as SessionEventRecord)
      .slice(-limit);
  }

  private getSessionEventPath(sessionId: string): string {
    return path.join(this.eventsDir, `${sanitizeSessionId(sessionId)}.jsonl`);
  }
}

function createEventId(): string {
  return `${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${Math.random().toString(16).slice(2, 10)}`;
}

function sanitizeSessionId(sessionId: string): string {
  return sessionId.replace(/[^a-zA-Z0-9_.-]/g, "_");
}
