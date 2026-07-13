import type { ControlDatabase } from "./sqlite.js";

import { createControlPlaneId } from "./shared.js";
import type { TaskLifecycleRecord, TaskLifecycleStage } from "./types.js";

interface TaskLifecycleRow {
  id: string;
  session_id: string;
  stage: string;
  scope: string | null;
  boundary: string | null;
  reason: string | null;
  active_execution_ids_json: string;
  active_todo_ids_json: string;
  verification_facts_json: string;
  completion_facts_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

const TASK_LIFECYCLE_STAGES = new Set<TaskLifecycleStage>([
  "light_response",
  "normal_work",
  "deep_work",
  "background_wait",
  "recovery",
  "completed",
]);

export class TaskLifecycleLedgerRepo {
  constructor(private readonly db: ControlDatabase) {}

  startTurn(input: {
    sessionId: string;
    reason?: string;
  }): TaskLifecycleRecord {
    const existing = this.loadCurrent(input.sessionId);
    const now = new Date().toISOString();
    const record: TaskLifecycleRecord = {
      id: existing?.stage === "completed" || !existing ? createControlPlaneId("task") : existing.id,
      sessionId: input.sessionId,
      stage: existing?.stage === "completed" || !existing ? "normal_work" : existing.stage,
      scope: existing?.scope,
      boundary: existing?.boundary,
      reason: normalizeText(input.reason) ?? existing?.reason ?? "turn_started",
      activeExecutionIds: existing?.activeExecutionIds ?? [],
      activeTodoIds: existing?.activeTodoIds ?? [],
      verificationFacts: existing?.verificationFacts ?? [],
      completionFacts: existing?.completionFacts ?? [],
      createdAt: existing?.stage === "completed" || !existing ? now : existing.createdAt,
      updatedAt: now,
      completedAt: undefined,
    };
    return existing && existing.stage !== "completed" ? this.save(record) : this.insert(record);
  }

  loadCurrent(sessionId: string): TaskLifecycleRecord | undefined {
    const row = this.db.prepare(`
      SELECT * FROM task_lifecycle
      WHERE session_id = ?
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(sessionId);
    return row ? fromTaskLifecycleRow(row as TaskLifecycleRow) : undefined;
  }

  update(input: {
    sessionId: string;
    stage?: TaskLifecycleStage;
    scope?: string;
    boundary?: string;
    reason?: string;
    activeExecutionIds?: readonly string[];
    activeTodoIds?: readonly string[];
    verificationFacts?: readonly string[];
    completionFacts?: readonly string[];
  }): TaskLifecycleRecord {
    const current = this.loadCurrent(input.sessionId) ?? this.startTurn({
      sessionId: input.sessionId,
      reason: input.reason,
    });
    const now = new Date().toISOString();
    return this.save({
      ...current,
      stage: input.stage ?? current.stage,
      scope: normalizeText(input.scope) ?? current.scope,
      boundary: normalizeText(input.boundary) ?? current.boundary,
      reason: normalizeText(input.reason) ?? current.reason,
      activeExecutionIds: normalizeStringList(input.activeExecutionIds ?? current.activeExecutionIds),
      activeTodoIds: normalizeStringList(input.activeTodoIds ?? current.activeTodoIds),
      verificationFacts: normalizeStringList(input.verificationFacts ?? current.verificationFacts),
      completionFacts: normalizeStringList(input.completionFacts ?? current.completionFacts),
      updatedAt: now,
      completedAt: input.stage === "completed" ? now : current.completedAt,
    });
  }

  appendExecutionWait(input: {
    sessionId: string;
    executionIds: readonly string[];
    reason: string;
  }): TaskLifecycleRecord {
    const current = this.loadCurrent(input.sessionId) ?? this.startTurn({
      sessionId: input.sessionId,
      reason: input.reason,
    });
    return this.update({
      sessionId: input.sessionId,
      stage: "background_wait",
      reason: input.reason,
      activeExecutionIds: [...current.activeExecutionIds, ...input.executionIds],
    });
  }

  complete(input: {
    sessionId: string;
    completionFacts?: readonly string[];
    verificationFacts?: readonly string[];
    reason?: string;
  }): TaskLifecycleRecord {
    return this.update({
      sessionId: input.sessionId,
      stage: "completed",
      reason: input.reason ?? "turn_completed",
      activeExecutionIds: [],
      completionFacts: input.completionFacts,
      verificationFacts: input.verificationFacts,
    });
  }

  private insert(record: TaskLifecycleRecord): TaskLifecycleRecord {
    this.db.prepare(`
      INSERT INTO task_lifecycle (
        id, session_id, stage, scope, boundary, reason,
        active_execution_ids_json, active_todo_ids_json,
        verification_facts_json, completion_facts_json,
        created_at, updated_at, completed_at
      ) VALUES (
        @id, @sessionId, @stage, @scope, @boundary, @reason,
        @activeExecutionIdsJson, @activeTodoIdsJson,
        @verificationFactsJson, @completionFactsJson,
        @createdAt, @updatedAt, @completedAt
      )
    `).run(toTaskLifecycleRow(record));
    return record;
  }

  private save(record: TaskLifecycleRecord): TaskLifecycleRecord {
    this.db.prepare(`
      UPDATE task_lifecycle SET
        session_id=@sessionId,
        stage=@stage,
        scope=@scope,
        boundary=@boundary,
        reason=@reason,
        active_execution_ids_json=@activeExecutionIdsJson,
        active_todo_ids_json=@activeTodoIdsJson,
        verification_facts_json=@verificationFactsJson,
        completion_facts_json=@completionFactsJson,
        created_at=@createdAt,
        updated_at=@updatedAt,
        completed_at=@completedAt
      WHERE id=@id
    `).run(toTaskLifecycleRow(record));
    return record;
  }
}

function toTaskLifecycleRow(record: TaskLifecycleRecord): Record<string, unknown> {
  return {
    id: record.id,
    sessionId: record.sessionId,
    stage: record.stage,
    scope: record.scope,
    boundary: record.boundary,
    reason: record.reason,
    activeExecutionIdsJson: JSON.stringify(normalizeStringList(record.activeExecutionIds)),
    activeTodoIdsJson: JSON.stringify(normalizeStringList(record.activeTodoIds)),
    verificationFactsJson: JSON.stringify(normalizeStringList(record.verificationFacts)),
    completionFactsJson: JSON.stringify(normalizeStringList(record.completionFacts)),
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    completedAt: record.completedAt,
  };
}

function fromTaskLifecycleRow(row: TaskLifecycleRow): TaskLifecycleRecord {
  const stage = TASK_LIFECYCLE_STAGES.has(row.stage as TaskLifecycleStage)
    ? row.stage as TaskLifecycleStage
    : "normal_work";
  return {
    id: row.id,
    sessionId: row.session_id,
    stage,
    scope: row.scope ?? undefined,
    boundary: row.boundary ?? undefined,
    reason: row.reason ?? undefined,
    activeExecutionIds: readStringList(row.active_execution_ids_json),
    activeTodoIds: readStringList(row.active_todo_ids_json),
    verificationFacts: readStringList(row.verification_facts_json),
    completionFacts: readStringList(row.completion_facts_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function readStringList(value: string): string[] {
  try {
    return normalizeStringList(JSON.parse(value));
  } catch {
    return [];
  }
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    const text = normalizeText(item);
    if (!text || seen.has(text)) {
      continue;
    }
    seen.add(text);
    items.push(text);
  }
  return items;
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.replace(/\s+/g, " ").trim() : undefined;
}
