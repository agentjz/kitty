import crypto from "node:crypto";
import type { ControlDatabase } from "./sqlite.js";

import type { ContextBudgetReport } from "../types.js";

export interface ContextEpochRecord {
  id: string;
  sessionId: string;
  sourceMessageCount: number;
  sourceLastMessageId?: string;
  sourcePrefixHash: string;
  summary: string;
  budget: ContextBudgetReport;
  createdAt: string;
}

interface ContextEpochRow {
  id: string;
  session_id: string;
  source_message_count: number;
  source_last_message_id: string | null;
  source_prefix_hash: string;
  summary: string;
  budget_json: string;
  created_at: string;
}

export class ContextEpochLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  record(input: Omit<ContextEpochRecord, "id" | "createdAt">): ContextEpochRecord {
    const latest = this.loadLatest(input.sessionId);
    if (latest?.sourcePrefixHash === input.sourcePrefixHash && latest.summary === input.summary) return latest;
    const record: ContextEpochRecord = {
      ...input,
      id: `context-${crypto.randomUUID()}`,
      createdAt: new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO context_epochs (
        id, session_id, source_message_count, source_last_message_id,
        source_prefix_hash, summary, budget_json, created_at
      ) VALUES (
        @id, @sessionId, @sourceMessageCount, @sourceLastMessageId,
        @sourcePrefixHash, @summary, @budgetJson, @createdAt
      )
    `).run({
      id: record.id,
      sessionId: record.sessionId,
      sourceMessageCount: record.sourceMessageCount,
      sourceLastMessageId: record.sourceLastMessageId,
      sourcePrefixHash: record.sourcePrefixHash,
      summary: record.summary,
      budgetJson: JSON.stringify(record.budget),
      createdAt: record.createdAt,
    });
    return record;
  }

  loadLatest(sessionId: string): ContextEpochRecord | undefined {
    const row = this.db.prepare(`
      SELECT * FROM context_epochs WHERE session_id=? ORDER BY created_at DESC LIMIT 1
    `).get(sessionId) as ContextEpochRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  list(sessionId: string): ContextEpochRecord[] {
    return (this.db.prepare(`
      SELECT * FROM context_epochs WHERE session_id=? ORDER BY created_at ASC
    `).all(sessionId) as ContextEpochRow[]).map(fromRow);
  }
}

function fromRow(row: ContextEpochRow): ContextEpochRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    sourceMessageCount: row.source_message_count,
    sourceLastMessageId: row.source_last_message_id ?? undefined,
    sourcePrefixHash: row.source_prefix_hash,
    summary: row.summary,
    budget: JSON.parse(row.budget_json) as ContextBudgetReport,
    createdAt: row.created_at,
  };
}
