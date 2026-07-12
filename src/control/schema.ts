import type Database from "better-sqlite3";

export const CONTROL_PLANE_SCHEMA_VERSION = 2;

export function initializeControlPlaneSchema(db: Database.Database): void {
  const initialize = db.transaction(() => {
    const version = db.pragma("user_version", { simple: true }) as number;
    if (version !== CONTROL_PLANE_SCHEMA_VERSION) {
      db.exec(`
        DROP TABLE IF EXISTS telegram_outbox;
        DROP TABLE IF EXISTS telegram_inbox;
        DROP TABLE IF EXISTS service_leases;
        DROP TABLE IF EXISTS runtime_events;
        DROP TABLE IF EXISTS context_epochs;
        DROP TABLE IF EXISTS tool_calls;
        DROP TABLE IF EXISTS turn_steers;
        DROP TABLE IF EXISTS interaction_drafts;
        DROP TABLE IF EXISTS session_messages;
        DROP TABLE IF EXISTS task_lifecycle;
        DROP TABLE IF EXISTS wake_signals;
        DROP TABLE IF EXISTS session_turns;
        DROP TABLE IF EXISTS executions;
        DROP TABLE IF EXISTS sessions;
      `);
    }
    db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      command TEXT NOT NULL,
      cwd TEXT NOT NULL,
      requested_by TEXT NOT NULL,
      owner_session_id TEXT NOT NULL,
      created_by_session_id TEXT NOT NULL,
      parent_turn_id TEXT NOT NULL,
      origin_tool_call_id TEXT NOT NULL,
      version INTEGER NOT NULL,
      controller_token TEXT NOT NULL,
      controller_generation INTEGER NOT NULL,
      controller_lease_expires_at TEXT NOT NULL,
      controller_heartbeat_at TEXT NOT NULL,
      pid INTEGER,
      process_identity_json TEXT,
      exit_code INTEGER,
      output TEXT,
      summary TEXT,
      deadline_at TEXT,
      last_output_at TEXT,
      close_reason TEXT,
      terminated_by TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      timeout_ms INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_executions_kind_status ON executions(kind, status);
    CREATE INDEX IF NOT EXISTS idx_executions_pid ON executions(pid);
    CREATE INDEX IF NOT EXISTS idx_executions_owner ON executions(owner_session_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_executions_origin ON executions(owner_session_id, parent_turn_id, origin_tool_call_id);

    CREATE TABLE IF NOT EXISTS wake_signals (
      id TEXT PRIMARY KEY,
      execution_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(execution_id) REFERENCES executions(id) ON DELETE CASCADE
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_wake_signals_execution ON wake_signals(execution_id);

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
      owner_generation INTEGER NOT NULL DEFAULT 0,
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
      consumed_generation INTEGER,
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
      call_id TEXT NOT NULL,
      turn_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      tool_name TEXT NOT NULL,
      arguments_json TEXT NOT NULL,
      effect TEXT NOT NULL,
      status TEXT NOT NULL,
      owner_generation INTEGER,
      result_json TEXT,
      before_hash TEXT,
      after_hash TEXT,
      started_at TEXT,
      updated_at TEXT NOT NULL,
      finished_at TEXT,
      FOREIGN KEY(turn_id) REFERENCES session_turns(id) ON DELETE CASCADE,
      FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
      PRIMARY KEY(turn_id, call_id)
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
      duration_ms INTEGER,
      tool_name TEXT,
      model TEXT,
      error_json TEXT,
      details_json TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_runtime_events_time ON runtime_events(timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_runtime_events_session ON runtime_events(session_id, timestamp DESC);

    CREATE TABLE IF NOT EXISTS service_leases (
      name TEXT PRIMARY KEY,
      owner_token TEXT NOT NULL,
      generation INTEGER NOT NULL,
      process_id INTEGER NOT NULL,
      process_identity_json TEXT,
      lease_expires_at TEXT NOT NULL,
      heartbeat_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_inbox (
      update_id INTEGER PRIMARY KEY,
      status TEXT NOT NULL,
      peer_key TEXT,
      turn_id TEXT,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS telegram_outbox (
      id TEXT PRIMARY KEY,
      chat_id INTEGER NOT NULL,
      kind TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      status TEXT NOT NULL,
      delivery_token TEXT,
      remote_message_id INTEGER,
      error TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_telegram_outbox_status ON telegram_outbox(status, created_at);
    `);
    db.pragma(`user_version = ${CONTROL_PLANE_SCHEMA_VERSION}`);
  });
  initialize.exclusive();
}
