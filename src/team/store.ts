import { ExecutionStore, type ExecutionRecord } from "../execution/store.js";
import { spawnExecutionWorker } from "../execution/launch.js";
import { ControlPlaneLedger, type TeamMemberRecord, type TeamMessageRecord } from "../control/ledger.js";
import type { RuntimeConfig } from "../types.js";

export type TeamMemberStatus = "working" | "idle" | "shutdown";

export type { TeamMemberRecord, TeamMessageRecord };

export class TeamStore {
  constructor(private readonly rootDir: string) {}

  spawnMember(input: {
    name: string;
    role: string;
    prompt: string;
    cwd: string;
    requestedBy: string;
    config: RuntimeConfig;
  }): { member: TeamMemberRecord; execution: ExecutionRecord } {
    const executionStore = new ExecutionStore(this.rootDir);
    const created = executionStore.create({
      kind: "team",
      prompt: input.prompt,
      cwd: input.cwd,
      requestedBy: input.requestedBy,
      actorName: input.name,
      actorRole: input.role,
    });
    const execution = executionStore.markRunning(created.id, {
      pid: spawnExecutionWorker({
        rootDir: this.rootDir,
        config: input.config,
        executionId: created.id,
      }),
    });
    const member = this.upsertMember({
      name: input.name,
      role: input.role,
      status: "working",
      executionId: execution.id,
      sessionId: execution.sessionId,
      pid: execution.pid,
    });
    return { member, execution };
  }

  upsertMember(input: {
    name: string;
    role: string;
    status: TeamMemberStatus;
    executionId?: string;
    sessionId?: string;
    pid?: number;
  }): TeamMemberRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.team.upsertMember(input);
    } finally {
      ledger.close();
    }
  }

  findMember(name: string): TeamMemberRecord | undefined {
    return this.listMembers().find((member) => member.name === name);
  }

  listMembers(): TeamMemberRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.team.listMembers();
    } finally {
      ledger.close();
    }
  }

  sendMessage(input: {
    from: string;
    to: string;
    message: string;
  }): TeamMessageRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.team.sendMessage(input);
    } finally {
      ledger.close();
    }
  }

  readInbox(name: string): TeamMessageRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.team.readInbox(name);
    } finally {
      ledger.close();
    }
  }
}
