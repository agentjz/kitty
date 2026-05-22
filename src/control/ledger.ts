import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

import type { ExecutionKind } from "../execution/kinds.js";
import { createLeadWaitPolicy, normalizeLeadWaitPolicy, type LeadWaitPolicy, type LeadWaitPolicyInput } from "../protocol/leadWait.js";
import { getProjectStatePaths } from "../project/statePaths.js";

export type ExecutionStatus = "created" | "running" | "paused" | "completed" | "failed" | "aborted" | "stale";
export type WakeSignalReason = "completed" | "failed" | "aborted" | "paused" | "stale";

export interface ExecutionRecord {
  id: string;
  kind: ExecutionKind;
  status: ExecutionStatus;
  command?: string;
  prompt?: string;
  actorName?: string;
  actorRole?: string;
  cwd: string;
  requestedBy: string;
  sessionId?: string;
  pid?: number;
  exitCode?: number | null;
  output?: string;
  summary?: string;
  waitPolicy?: LeadWaitPolicy;
  createdAt: string;
  startedAt?: string;
  updatedAt: string;
  finishedAt?: string;
  timeoutMs?: number;
}

export interface WakeSignalRecord {
  id: string;
  executionId: string;
  reason: WakeSignalReason;
  createdAt: string;
}

export interface TeamMemberRecord {
  name: string;
  role: string;
  status: "working" | "idle" | "shutdown";
  executionId?: string;
  sessionId?: string;
  pid?: number;
  updatedAt: string;
}

export interface TeamMessageRecord {
  id: string;
  from: string;
  to: string;
  message: string;
  createdAt: string;
}

export class ControlPlaneLedger {
  readonly executions: ExecutionLedgerRepo;
  readonly wakeSignals: WakeSignalLedgerRepo;
  readonly team: TeamLedgerRepo;
  private readonly db: Database.Database;

  constructor(rootDir: string) {
    const statePaths = getProjectStatePaths(rootDir);
    fs.mkdirSync(statePaths.kittyDir, { recursive: true });
    this.db = new Database(statePaths.controlPlaneLedgerFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    initializeSchema(this.db);
    this.executions = new ExecutionLedgerRepo(this.db);
    this.wakeSignals = new WakeSignalLedgerRepo(this.db);
    this.team = new TeamLedgerRepo(this.db);
  }

  close(): void {
    this.db.close();
  }
}

export class ExecutionLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  create(input: {
    id?: string;
    kind: ExecutionKind;
    status?: Extract<ExecutionStatus, "created" | "running">;
    command?: string;
    prompt?: string;
    actorName?: string;
    actorRole?: string;
    cwd: string;
    requestedBy: string;
    sessionId?: string;
    pid?: number;
    timeoutMs?: number;
    waitPolicy?: LeadWaitPolicyInput;
  }): ExecutionRecord {
    const now = new Date().toISOString();
    const record: ExecutionRecord = {
      id: input.id ?? createId("exec"),
      kind: input.kind,
      status: input.status ?? "created",
      command: input.command,
      prompt: input.prompt,
      actorName: input.actorName,
      actorRole: input.actorRole,
      cwd: path.resolve(input.cwd),
      requestedBy: input.requestedBy,
      sessionId: input.sessionId,
      pid: input.pid,
      waitPolicy: normalizeExecutionWaitPolicy(input.kind, input.waitPolicy),
      createdAt: now,
      startedAt: input.status === "running" ? now : undefined,
      updatedAt: now,
      timeoutMs: input.timeoutMs,
    };
    this.db.prepare(`
      INSERT INTO executions (
        id, kind, status, command, prompt, actor_name, actor_role, cwd, requested_by, session_id, pid, exit_code,
        output, summary, wait_policy_json, created_at, started_at, updated_at, finished_at, timeout_ms
      ) VALUES (
        @id, @kind, @status, @command, @prompt, @actorName, @actorRole, @cwd, @requestedBy, @sessionId, @pid, @exitCode,
        @output, @summary, @waitPolicyJson, @createdAt, @startedAt, @updatedAt, @finishedAt, @timeoutMs
      )
    `).run(toExecutionRow(record));
    return record;
  }

  load(id: string): ExecutionRecord | undefined {
    const row = this.db.prepare("SELECT * FROM executions WHERE id = ?").get(id);
    return row ? fromExecutionRow(row as ExecutionRow) : undefined;
  }

  list(input: {
    kind?: ExecutionKind;
    kinds?: readonly ExecutionKind[];
    statuses?: readonly ExecutionStatus[];
    cwd?: string;
  } = {}): ExecutionRecord[] {
    const rows = this.db.prepare("SELECT * FROM executions ORDER BY created_at ASC").all() as ExecutionRow[];
    const cwd = input.cwd ? path.resolve(input.cwd) : undefined;
    const statuses = new Set(input.statuses ?? []);
    const kinds = new Set(input.kinds ?? []);
    return rows
      .map(fromExecutionRow)
      .filter((record) => !input.kind || record.kind === input.kind)
      .filter((record) => kinds.size === 0 || kinds.has(record.kind))
      .filter((record) => statuses.size === 0 || statuses.has(record.status))
      .filter((record) => !cwd || isSameOrDescendant(path.resolve(record.cwd), cwd) || isSameOrDescendant(cwd, path.resolve(record.cwd)));
  }

  markRunning(id: string, input: { pid: number; startedAt?: string }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    const now = new Date().toISOString();
    return this.save({
      ...current,
      status: "running",
      pid: input.pid,
      startedAt: input.startedAt ?? current.startedAt ?? now,
      updatedAt: now,
    });
  }

  close(id: string, input: {
    status: Extract<ExecutionStatus, "completed" | "failed" | "aborted" | "stale" | "paused">;
    exitCode?: number | null;
    output?: string;
    summary?: string;
    finishedAt?: string;
  }): ExecutionRecord {
    const current = requireExecution(this.load(id), id);
    if (isTerminalExecutionStatus(current.status)) {
      return current;
    }
    const now = new Date().toISOString();
    return this.save({
      ...current,
      status: input.status,
      exitCode: input.exitCode,
      output: input.output,
      summary: input.summary,
      updatedAt: now,
      finishedAt: input.finishedAt ?? now,
    });
  }

  save(record: ExecutionRecord): ExecutionRecord {
    this.db.prepare(`
      UPDATE executions SET
        kind=@kind,
        status=@status,
        command=@command,
        prompt=@prompt,
        actor_name=@actorName,
        actor_role=@actorRole,
        cwd=@cwd,
        requested_by=@requestedBy,
        session_id=@sessionId,
        pid=@pid,
        exit_code=@exitCode,
        output=@output,
        summary=@summary,
        wait_policy_json=@waitPolicyJson,
        created_at=@createdAt,
        started_at=@startedAt,
        updated_at=@updatedAt,
        finished_at=@finishedAt,
        timeout_ms=@timeoutMs
      WHERE id=@id
    `).run(toExecutionRow(record));
    return record;
  }
}

function isTerminalExecutionStatus(status: ExecutionStatus): boolean {
  return status === "completed" || status === "failed" || status === "aborted" || status === "stale";
}

export class WakeSignalLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  publish(input: { executionId: string; reason: WakeSignalReason; createdAt?: string }): WakeSignalRecord {
    const record: WakeSignalRecord = {
      id: createId("wake"),
      executionId: input.executionId,
      reason: input.reason,
      createdAt: input.createdAt ?? new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO wake_signals (id, execution_id, reason, created_at)
      VALUES (@id, @executionId, @reason, @createdAt)
    `).run(record);
    return record;
  }

  list(): WakeSignalRecord[] {
    return (this.db.prepare("SELECT * FROM wake_signals ORDER BY created_at ASC").all() as WakeSignalRow[])
      .map((row) => ({
        id: row.id,
        executionId: row.execution_id,
        reason: row.reason as WakeSignalReason,
        createdAt: row.created_at,
      }));
  }
}

export class TeamLedgerRepo {
  constructor(private readonly db: Database.Database) {}

  upsertMember(input: Omit<TeamMemberRecord, "updatedAt">): TeamMemberRecord {
    const member: TeamMemberRecord = {
      ...input,
      updatedAt: new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO team_members (name, role, status, execution_id, session_id, pid, updated_at)
      VALUES (@name, @role, @status, @executionId, @sessionId, @pid, @updatedAt)
      ON CONFLICT(name) DO UPDATE SET
        role=excluded.role,
        status=excluded.status,
        execution_id=excluded.execution_id,
        session_id=excluded.session_id,
        pid=excluded.pid,
        updated_at=excluded.updated_at
    `).run({
      name: member.name,
      role: member.role,
      status: member.status,
      executionId: member.executionId ?? null,
      sessionId: member.sessionId ?? null,
      pid: member.pid ?? null,
      updatedAt: member.updatedAt,
    });
    return member;
  }

  listMembers(): TeamMemberRecord[] {
    return (this.db.prepare("SELECT * FROM team_members ORDER BY name ASC").all() as TeamMemberRow[]).map(fromTeamMemberRow);
  }

  findMember(name: string): TeamMemberRecord | undefined {
    const row = this.db.prepare("SELECT * FROM team_members WHERE name = ?").get(name);
    return row ? fromTeamMemberRow(row as TeamMemberRow) : undefined;
  }

  sendMessage(input: Omit<TeamMessageRecord, "id" | "createdAt">): TeamMessageRecord {
    const message: TeamMessageRecord = {
      id: createId("msg"),
      from: input.from,
      to: input.to,
      message: input.message,
      createdAt: new Date().toISOString(),
    };
    this.db.prepare(`
      INSERT INTO team_messages (id, sender, recipient, message, created_at)
      VALUES (@id, @from, @to, @message, @createdAt)
    `).run(message);
    return message;
  }

  readInbox(name: string): TeamMessageRecord[] {
    const rows = this.db.prepare("SELECT * FROM team_messages WHERE recipient = ? ORDER BY created_at ASC").all(name) as TeamMessageRow[];
    this.db.prepare("DELETE FROM team_messages WHERE recipient = ?").run(name);
    return rows.map(fromTeamMessageRow);
  }
}

interface ExecutionRow {
  id: string;
  kind: string;
  status: string;
  command: string | null;
  prompt: string | null;
  actor_name: string | null;
  actor_role: string | null;
  cwd: string;
  requested_by: string;
  session_id: string | null;
  pid: number | null;
  exit_code: number | null;
  output: string | null;
  summary: string | null;
  wait_policy_json: string | null;
  created_at: string;
  started_at: string | null;
  updated_at: string;
  finished_at: string | null;
  timeout_ms: number | null;
}

interface WakeSignalRow {
  id: string;
  execution_id: string;
  reason: string;
  created_at: string;
}

interface TeamMemberRow {
  name: string;
  role: string;
  status: string;
  execution_id: string | null;
  session_id: string | null;
  pid: number | null;
  updated_at: string;
}

interface TeamMessageRow {
  id: string;
  sender: string;
  recipient: string;
  message: string;
  created_at: string;
}

function initializeSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS executions (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
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

function toExecutionRow(record: ExecutionRecord): Record<string, unknown> {
  return {
    id: record.id,
    kind: record.kind,
    status: record.status,
    command: record.command,
    prompt: record.prompt,
    actorName: record.actorName,
    actorRole: record.actorRole,
    cwd: record.cwd,
    requestedBy: record.requestedBy,
    sessionId: record.sessionId,
    pid: record.pid,
    exitCode: record.exitCode,
    output: record.output,
    summary: record.summary,
    waitPolicyJson: record.waitPolicy ? JSON.stringify(record.waitPolicy) : null,
    createdAt: record.createdAt,
    startedAt: record.startedAt,
    updatedAt: record.updatedAt,
    finishedAt: record.finishedAt,
    timeoutMs: record.timeoutMs,
  };
}

function fromExecutionRow(row: ExecutionRow): ExecutionRecord {
  return {
    id: row.id,
    kind: row.kind as ExecutionKind,
    status: row.status as ExecutionStatus,
    command: row.command ?? undefined,
    prompt: row.prompt ?? undefined,
    actorName: row.actor_name ?? undefined,
    actorRole: row.actor_role ?? undefined,
    cwd: row.cwd,
    requestedBy: row.requested_by,
    sessionId: row.session_id ?? undefined,
    pid: row.pid ?? undefined,
    exitCode: row.exit_code,
    output: row.output ?? undefined,
    summary: row.summary ?? undefined,
    waitPolicy: readWaitPolicy(row.wait_policy_json, row.kind as ExecutionKind),
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    updatedAt: row.updated_at,
    finishedAt: row.finished_at ?? undefined,
    timeoutMs: row.timeout_ms ?? undefined,
  };
}

function normalizeExecutionWaitPolicy(kind: ExecutionKind, value?: LeadWaitPolicyInput): LeadWaitPolicy {
  if (value) {
    return normalizeLeadWaitPolicy(value);
  }

  return kind === "subagent" || kind === "team"
    ? createLeadWaitPolicy({
        lead: "while_execution_active",
        wake: "required",
        scope: "objective",
      })
    : createLeadWaitPolicy({
        lead: "none",
        wake: "optional",
        scope: "objective",
      });
}

function readWaitPolicy(value: string | null, kind: ExecutionKind): LeadWaitPolicy {
  if (!value) {
    return normalizeExecutionWaitPolicy(kind);
  }

  try {
    return normalizeLeadWaitPolicy(JSON.parse(value));
  } catch {
    return normalizeExecutionWaitPolicy(kind);
  }
}

function fromTeamMemberRow(row: TeamMemberRow): TeamMemberRecord {
  return {
    name: row.name,
    role: row.role,
    status: row.status === "idle" || row.status === "shutdown" ? row.status : "working",
    executionId: row.execution_id ?? undefined,
    sessionId: row.session_id ?? undefined,
    pid: row.pid ?? undefined,
    updatedAt: row.updated_at,
  };
}

function fromTeamMessageRow(row: TeamMessageRow): TeamMessageRecord {
  return {
    id: row.id,
    from: row.sender,
    to: row.recipient,
    message: row.message,
    createdAt: row.created_at,
  };
}

function requireExecution(record: ExecutionRecord | undefined, id: string): ExecutionRecord {
  if (!record) {
    throw new Error(`Unknown execution: ${id}`);
  }
  return record;
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function isSameOrDescendant(targetPath: string, possibleAncestor: string): boolean {
  const relative = path.relative(possibleAncestor, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}
