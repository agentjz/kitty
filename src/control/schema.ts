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

    CREATE TABLE IF NOT EXISTS team_members (
      name TEXT PRIMARY KEY,
      role TEXT NOT NULL,
      status TEXT NOT NULL,
      execution_id TEXT,
      session_id TEXT,
      pid INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS team_messages (
      id TEXT PRIMARY KEY,
      sender TEXT NOT NULL,
      recipient TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_team_messages_recipient ON team_messages(recipient);
  `);
  ensureColumn(db, "executions", "prompt", "TEXT");
  ensureColumn(db, "executions", "assignment_json", "TEXT");
  ensureColumn(db, "executions", "actor_name", "TEXT");
  ensureColumn(db, "executions", "actor_role", "TEXT");
  ensureColumn(db, "executions", "wait_policy_json", "TEXT");
}

function ensureColumn(db: Database.Database, table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((item) => item.name === column)) {
    return;
  }
  db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
}
