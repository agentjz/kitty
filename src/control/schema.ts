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
      timeout_ms INTEGER,
      owner_token TEXT,
      heartbeat_at TEXT,
      lease_expires_at TEXT,
      cancel_requested_at TEXT
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
      scope TEXT,
      boundary TEXT,
      reason TEXT,
      active_execution_ids_json TEXT NOT NULL,
      active_todo_ids_json TEXT NOT NULL,
      verification_facts_json TEXT NOT NULL,
      completion_facts_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_task_lifecycle_session ON task_lifecycle(session_id, updated_at);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      revision INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cwd TEXT NOT NULL,
      title TEXT,
      state_json TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at DESC);

    CREATE TABLE IF NOT EXISTS interaction_drafts (
      session_id TEXT NOT NULL,
      shell TEXT NOT NULL,
      value TEXT NOT NULL,
      cursor INTEGER NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY(session_id, shell)
    );

    CREATE TABLE IF NOT EXISTS session_messages (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      message_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(session_id, sequence)
    );

    CREATE INDEX IF NOT EXISTS idx_session_messages_session ON session_messages(session_id, sequence);

    CREATE TABLE IF NOT EXISTS session_turns (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      input TEXT NOT NULL,
      input_source TEXT NOT NULL,
      status TEXT NOT NULL,
      owner_token TEXT,
      lease_expires_at TEXT,
      heartbeat_at TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_session_turns_session_status ON session_turns(session_id, status, created_at);

    CREATE TABLE IF NOT EXISTS turn_steers (
      id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      sequence INTEGER NOT NULL,
      input TEXT NOT NULL,
      message_id TEXT NOT NULL,
      status TEXT NOT NULL,
      rejection_reason TEXT,
      created_at TEXT NOT NULL,
      consumed_at TEXT,
      rejected_at TEXT,
      FOREIGN KEY(turn_id) REFERENCES session_turns(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      UNIQUE(turn_id, sequence),
      UNIQUE(message_id)
    );

    CREATE INDEX IF NOT EXISTS idx_turn_steers_turn_status ON turn_steers(turn_id, status, sequence);

    CREATE TABLE IF NOT EXISTS tool_calls (
      call_id TEXT PRIMARY KEY,
      turn_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      effect TEXT NOT NULL,
      status TEXT NOT NULL,
      result_json TEXT,
      before_hash TEXT,
      after_hash TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(turn_id) REFERENCES session_turns(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tool_calls_turn ON tool_calls(turn_id, updated_at);

    CREATE TABLE IF NOT EXISTS context_epochs (
      id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      source_message_count INTEGER NOT NULL,
      source_last_message_id TEXT,
      source_prefix_hash TEXT NOT NULL,
      summary TEXT NOT NULL,
      budget_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_context_epochs_session ON context_epochs(session_id, created_at DESC);

    CREATE TABLE IF NOT EXISTS runtime_events (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      host TEXT,
      session_id TEXT,
      turn_id TEXT,
      item_id TEXT,
      execution_id TEXT,
      request_id TEXT,
      attempt_id TEXT,
      identity_kind TEXT,
      identity_name TEXT,
      duration_ms INTEGER,
      tool_name TEXT,
      model TEXT,
      error_json TEXT,
      details_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_events_time ON runtime_events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_runtime_events_session ON runtime_events(session_id, timestamp DESC);
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
  ensureColumn(db, "executions", "owner_token", "TEXT");
  ensureColumn(db, "executions", "heartbeat_at", "TEXT");
  ensureColumn(db, "executions", "lease_expires_at", "TEXT");
  ensureColumn(db, "executions", "cancel_requested_at", "TEXT");
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
