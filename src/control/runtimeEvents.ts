import crypto from "node:crypto";
import type Database from "better-sqlite3";

import type { ObservabilityEventRecord } from "../observability/schema.js";

export class RuntimeEventLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  append(record: ObservabilityEventRecord): ObservabilityEventRecord {
    this.db.prepare(`
      INSERT INTO runtime_events (
        id, timestamp, event, status, host, session_id, turn_id, item_id,
        execution_id, request_id, attempt_id, identity_kind, identity_name,
        duration_ms, tool_name, model, error_json, details_json
      ) VALUES (
        @id, @timestamp, @event, @status, @host, @sessionId, @turnId, @itemId,
        @executionId, @requestId, @attemptId, @identityKind, @identityName,
        @durationMs, @toolName, @model, @errorJson, @detailsJson
      )
    `).run({
      id: `event-${crypto.randomUUID()}`,
      ...record,
      errorJson: record.error ? JSON.stringify(record.error) : undefined,
      detailsJson: record.details ? JSON.stringify(record.details) : undefined,
    });
    return record;
  }

  list(limit = 100): ObservabilityEventRecord[] {
    const rows = this.db.prepare(`
      SELECT * FROM runtime_events ORDER BY timestamp DESC LIMIT ?
    `).all(limit) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      timestamp: String(row.timestamp),
      event: String(row.event),
      status: String(row.status),
      host: optionalString(row.host),
      sessionId: optionalString(row.session_id),
      turnId: optionalString(row.turn_id),
      itemId: optionalString(row.item_id),
      executionId: optionalString(row.execution_id),
      requestId: optionalString(row.request_id),
      attemptId: optionalString(row.attempt_id),
      identityKind: optionalString(row.identity_kind),
      identityName: optionalString(row.identity_name),
      durationMs: typeof row.duration_ms === "number" ? row.duration_ms : undefined,
      toolName: optionalString(row.tool_name),
      model: optionalString(row.model),
      error: row.error_json ? JSON.parse(String(row.error_json)) : undefined,
      details: row.details_json ? JSON.parse(String(row.details_json)) : undefined,
    }));
  }
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
