import type { ControlDatabase } from "./sqlite.js";
import { renewTurnLease } from "./turnLease.js";

import type { ToolEffect } from "../tools/core/types.js";
import type { ToolResultEnvelope } from "../types.js";

export type ToolCallStatus = "planned" | "running" | "success" | "error" | "interrupted" | "uncertain";

export interface DurableToolCall {
  callId: string;
  turnId: string;
  sessionId: string;
  toolName: string;
  argumentsJson: string;
  effect: ToolEffect;
  status: ToolCallStatus;
  ownerGeneration?: number;
  result?: ToolResultEnvelope;
  beforeHash?: string;
  afterHash?: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
}

interface ToolCallRow {
  call_id: string;
  turn_id: string;
  session_id: string;
  tool_name: string;
  arguments_json: string;
  effect: string;
  status: string;
  owner_generation: number | null;
  result_json: string | null;
  before_hash: string | null;
  after_hash: string | null;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
}

export class ToolCallLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  start(input: {
    callId: string;
    turnId: string;
    sessionId: string;
    toolName: string;
    argumentsJson: string;
    effect: ToolEffect;
    beforeHash?: string;
  }): DurableToolCall {
    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT INTO tool_calls (
        call_id, turn_id, session_id, tool_name, arguments_json, effect, status,
        before_hash, started_at, updated_at
      ) VALUES (
        @callId, @turnId, @sessionId, @toolName, @argumentsJson, @effect, 'planned',
        @beforeHash, NULL, @now
      )
      ON CONFLICT(turn_id, call_id) DO NOTHING
    `).run({ ...input, beforeHash: input.beforeHash ?? null, now });
    const existing = this.require(input.turnId, input.callId);
    if (existing.sessionId !== input.sessionId || existing.toolName !== input.toolName ||
      existing.argumentsJson !== input.argumentsJson || existing.effect !== input.effect) {
      throw new Error(`Tool call ${input.turnId}/${input.callId} conflicts with a different planned effect.`);
    }
    return existing;
  }

  activate(input: { callId: string; turnId: string; ownerToken: string; ownerGeneration: number }): DurableToolCall {
    return this.db.transaction(() => {
      renewTurnLease(this.db, input);
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        UPDATE tool_calls
        SET status='running', owner_generation=@ownerGeneration, started_at=@now, updated_at=@now
        WHERE turn_id=@turnId AND call_id=@callId AND status='planned'
      `).run({
        callId: input.callId,
        turnId: input.turnId,
        ownerGeneration: input.ownerGeneration,
        now,
      });
      if (result.changes !== 1) {
        throw new Error(`Tool call ${input.turnId}/${input.callId} cannot start from its current state.`);
      }
      return this.require(input.turnId, input.callId);
    })();
  }

  settle(input: {
    callId: string;
    turnId: string;
    ownerToken: string;
    ownerGeneration: number;
    result: ToolResultEnvelope;
    beforeHash?: string;
    afterHash?: string;
  }): DurableToolCall {
    return this.db.transaction(() => {
      const current = this.require(input.turnId, input.callId);
      const status = input.result.status;
      if (current.status === status && JSON.stringify(current.result) === JSON.stringify(input.result)) {
        return current;
      }
      renewTurnLease(this.db, input, { allowClosing: true });
      const now = new Date().toISOString();
      const update = this.db.prepare(`
        UPDATE tool_calls
        SET status=@status, result_json=@resultJson, before_hash=COALESCE(@beforeHash, before_hash), after_hash=@afterHash,
            updated_at=@now, finished_at=@now
        WHERE turn_id=@turnId AND call_id=@callId AND status='running'
          AND owner_generation=@ownerGeneration
      `).run({
        callId: input.callId,
        turnId: input.turnId,
        ownerGeneration: input.ownerGeneration,
        status,
        resultJson: JSON.stringify(input.result),
        beforeHash: input.beforeHash ?? null,
        afterHash: input.afterHash ?? null,
        now,
      });
      if (update.changes !== 1) {
        throw new Error(`Tool call ${input.turnId}/${input.callId} cannot be settled from ${current.status}.`);
      }
      return this.require(input.turnId, input.callId);
    })();
  }

  interruptRecoverable(sessionId: string): DurableToolCall[] {
    const now = new Date().toISOString();
    const rows = this.db.prepare(`
      SELECT tool_calls.* FROM tool_calls
      JOIN session_turns ON session_turns.id=tool_calls.turn_id
      WHERE tool_calls.session_id=? AND tool_calls.status IN ('planned', 'running')
        AND (session_turns.status NOT IN ('running', 'closing') OR session_turns.lease_expires_at <= ?)
      ORDER BY COALESCE(tool_calls.started_at, tool_calls.updated_at) ASC
    `).all(sessionId, now) as ToolCallRow[];
    return rows.map((row) => {
      const result = buildInterruptedResult(row);
      const now = new Date().toISOString();
      this.db.prepare(`
        UPDATE tool_calls
        SET status=?, result_json=?, updated_at=?, finished_at=?
        WHERE turn_id=? AND call_id=? AND status IN ('planned', 'running')
      `).run(row.status === "running" && row.effect !== "read" ? "uncertain" : "interrupted", JSON.stringify(result), now, now, row.turn_id, row.call_id);
      return this.require(row.turn_id, row.call_id);
    });
  }

  listBySession(sessionId: string): DurableToolCall[] {
    return (this.db.prepare(`
      SELECT * FROM tool_calls WHERE session_id=? ORDER BY started_at ASC
    `).all(sessionId) as ToolCallRow[]).map(fromRow);
  }

  load(turnId: string, callId: string): DurableToolCall | undefined {
    const row = this.db.prepare("SELECT * FROM tool_calls WHERE turn_id=? AND call_id=?").get(turnId, callId) as ToolCallRow | undefined;
    return row ? fromRow(row) : undefined;
  }

  private require(turnId: string, callId: string): DurableToolCall {
    const record = this.load(turnId, callId);
    if (!record) throw new Error(`Unknown tool call: ${turnId}/${callId}`);
    return record;
  }
}

function buildInterruptedResult(row: ToolCallRow): ToolResultEnvelope {
  const targetPath = readTargetPath(row.arguments_json);
  const recoveryHint = row.effect === "read"
    ? "Re-run the read after confirming the session still needs it."
    : "Inspect the target state before deciding whether to retry; the previous process may have applied side effects.";
  const modelView = [
    `${row.tool_name}: error`,
    "Tool execution was interrupted before a durable result was recorded.",
    targetPath ? `target=${targetPath}` : undefined,
    `effect=${row.effect}`,
    `recovery: ${recoveryHint}`,
  ].filter(Boolean).join("\n");
  return {
    callId: row.call_id,
    toolName: row.tool_name,
    status: "error",
    summary: `${row.tool_name} was interrupted before result persistence.`,
    modelView,
    compactView: modelView,
    provenance: targetPath ? { targetPath } : undefined,
    facts: { effect: row.effect },
    error: {
      code: "TOOL_EXECUTION_INTERRUPTED",
      message: "The tool started, but the runtime stopped before recording its result.",
      recoveryHint,
    },
    artifacts: [],
    truncation: {
      truncated: false,
      strategy: "none",
      projectedChars: modelView.length,
    },
  };
}

function readTargetPath(rawArguments: string): string | undefined {
  try {
    const value = JSON.parse(rawArguments) as Record<string, unknown>;
    const target = value.path ?? value.filePath;
    return typeof target === "string" && target.length > 0 ? target : undefined;
  } catch {
    return undefined;
  }
}

function fromRow(row: ToolCallRow): DurableToolCall {
  return {
    callId: row.call_id,
    turnId: row.turn_id,
    sessionId: row.session_id,
    toolName: row.tool_name,
    argumentsJson: row.arguments_json,
    effect: row.effect as ToolEffect,
    status: row.status as ToolCallStatus,
    ownerGeneration: row.owner_generation ?? undefined,
    result: row.result_json ? JSON.parse(row.result_json) as ToolResultEnvelope : undefined,
    beforeHash: row.before_hash ?? undefined,
    afterHash: row.after_hash ?? undefined,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
  };
}
