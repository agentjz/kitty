import type Database from "better-sqlite3";

import { createControlPlaneId } from "./shared.js";
import type { TeamMemberRecord, TeamMessageRecord } from "./types.js";

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
      id: createControlPlaneId("msg"),
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

