import type { ControlDatabase } from "./sqlite.js";

export interface InteractionDraftRecord {
  sessionId: string;
  shell: string;
  value: string;
  cursor: number;
  updatedAt: string;
}

interface InteractionDraftRow {
  session_id: string;
  shell: string;
  value: string;
  cursor: number;
  updated_at: string;
}

export class InteractionDraftLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  load(sessionId: string, shell: string): InteractionDraftRecord | undefined {
    const row = this.db.prepare(`
      SELECT session_id, shell, value, cursor, updated_at
      FROM interaction_drafts
      WHERE session_id = ? AND shell = ?
    `).get(sessionId, shell) as InteractionDraftRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  save(record: InteractionDraftRecord): void {
    this.db.prepare(`
      INSERT INTO interaction_drafts (session_id, shell, value, cursor, updated_at)
      VALUES (@sessionId, @shell, @value, @cursor, @updatedAt)
      ON CONFLICT(session_id, shell) DO UPDATE SET
        value=excluded.value,
        cursor=excluded.cursor,
        updated_at=excluded.updated_at
    `).run(record);
  }

  delete(sessionId: string, shell: string): void {
    this.db.prepare("DELETE FROM interaction_drafts WHERE session_id = ? AND shell = ?")
      .run(sessionId, shell);
  }
}

function fromRow(row: InteractionDraftRow): InteractionDraftRecord {
  return {
    sessionId: row.session_id,
    shell: row.shell,
    value: row.value,
    cursor: row.cursor,
    updatedAt: row.updated_at,
  };
}
