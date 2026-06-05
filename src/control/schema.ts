import type Database from "better-sqlite3";

export function initializeControlPlaneSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      assignment_json TEXT,
      command TEXT,
      prompt TEXT,
      actor_name TEXT,
      actor_role TEXT,
      cwd TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      session_id TEXT,
      pid INTEGER,
      exit_code INTEGER,
      output TEXT,
      summary TEXT,
      wait_policy_json TEXT,
      deadline_at TEXT,
      last_output_at TEXT,
      close_reason TEXT,
      terminated_by TEXT,
      changed_paths_json TEXT NOT NULL DEFAULT '[]',
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      timeout_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_executions_kind_status ON executions(kind, status);
    CREATE INDEX IF NOT EXISTS idx_executions_pid ON executions(pid);

    CREATE TABLE IF NOT EXISTS wake_signals (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(execution_id) REFERENCES executions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_wake_signals_execution ON wake_signals(execution_id);

    CREATE TABLE IF NOT EXISTS task_lifecycle (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      stage TEXT NOT NULL,
      objective TEXT,
      scope TEXT,
      boundary TEXT,
      reason TEXT,
      active_execution_ids_json TEXT NOT NULL,
      active_spec_id TEXT,
      active_todo_ids_json TEXT NOT NULL,
      verification_facts_json TEXT NOT NULL,
      completion_facts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_lifecycle_session ON task_lifecycle(session_id, updated_at);
  `);
  ensureColumn(db, "executions", "prompt", "TEXT");
  ensureColumn(db, "executions", "assignment_json", "TEXT");
  ensureColumn(db, "executions", "actor_name", "TEXT");
  ensureColumn(db, "executions", "actor_role", "TEXT");
  ensureColumn(db, "executions", "wait_policy_json", "TEXT");
  ensureColumn(db, "executions", "deadline_at", "TEXT");
  ensureColumn(db, "executions", "last_output_at", "TEXT");
  ensureColumn(db, "executions", "close_reason", "TEXT");
  ensureColumn(db, "executions", "terminated_by", "TEXT");
  ensureColumn(db, "executions", "changed_paths_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "executions", "error", "TEXT");
  ensureColumn(db, "task_lifecycle", "active_execution_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "task_lifecycle", "active_todo_ids_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "task_lifecycle", "verification_facts_json", "TEXT NOT NULL DEFAULT '[]'");
  ensureColumn(db, "task_lifecycle", "completion_facts_json", "TEXT NOT NULL DEFAULT '[]'");
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) {
    return;
  }
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}
