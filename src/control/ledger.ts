import Database from "better-sqlite3";
import fs from "node:fs";

import { getProjectStatePaths } from "../project/statePaths.js";
import { ExecutionLedgerRepo } from "./executions.js";
import { initializeControlPlaneSchema } from "./schema.js";
import { TaskLifecycleLedgerRepo } from "./taskLifecycle.js";
import { TeamLedgerRepo } from "./teamRepo.js";
import { WakeSignalLedgerRepo } from "./wakeSignals.js";

export type {
  ExecutionRecord,
  ExecutionStatus,
  TeamMemberRecord,
  TeamMessageRecord,
  TaskLifecycleRecord,
  TaskLifecycleStage,
  WakeSignalReason,
  WakeSignalRecord,
} from "./types.js";

export { ExecutionLedgerRepo } from "./executions.js";
export { TaskLifecycleLedgerRepo } from "./taskLifecycle.js";
export { TeamLedgerRepo } from "./teamRepo.js";
export { WakeSignalLedgerRepo } from "./wakeSignals.js";

export class ControlPlaneLedger {
  readonly executions: ExecutionLedgerRepo;
  readonly wakeSignals: WakeSignalLedgerRepo;
  readonly team: TeamLedgerRepo;
  readonly taskLifecycle: TaskLifecycleLedgerRepo;
  private readonly db: Database.Database;

  constructor(rootDir: string) {
    const statePaths = getProjectStatePaths(rootDir);
    fs.mkdirSync(statePaths.kittyDir, { recursive: true });
    this.db = new Database(statePaths.controlPlaneLedgerFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    initializeControlPlaneSchema(this.db);
    this.executions = new ExecutionLedgerRepo(this.db);
    this.wakeSignals = new WakeSignalLedgerRepo(this.db);
    this.team = new TeamLedgerRepo(this.db);
    this.taskLifecycle = new TaskLifecycleLedgerRepo(this.db);
  }

  close(): void {
    this.db.close();
  }
}
