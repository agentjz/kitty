import Database from "better-sqlite3";
import fs from "node:fs";

import { getProjectStatePaths } from "../project/statePaths.js";
import { ExecutionLedgerRepo } from "./executions.js";
import { initializeControlPlaneSchema } from "./schema.js";
import { TaskLifecycleLedgerRepo } from "./taskLifecycle.js";
import { WakeSignalLedgerRepo } from "./wakeSignals.js";
import { SessionLedgerRepo } from "./sessions.js";
import { TurnLedgerRepo } from "./turns.js";
import { ToolCallLedgerRepo } from "./toolCalls.js";
import { ContextEpochLedgerRepo } from "./contextEpochs.js";
import { RuntimeEventLedgerRepo } from "./runtimeEvents.js";

export type {
  ExecutionRecord,
  ExecutionStatus,
  TaskLifecycleRecord,
  TaskLifecycleStage,
  WakeSignalReason,
  WakeSignalRecord,
} from "./types.js";

export { ExecutionLedgerRepo } from "./executions.js";
export { TaskLifecycleLedgerRepo } from "./taskLifecycle.js";
export { WakeSignalLedgerRepo } from "./wakeSignals.js";

export class ControlPlaneLedger {
  readonly executions: ExecutionLedgerRepo;
  readonly wakeSignals: WakeSignalLedgerRepo;
  readonly taskLifecycle: TaskLifecycleLedgerRepo;
  readonly sessions: SessionLedgerRepo;
  readonly turns: TurnLedgerRepo;
  readonly toolCalls: ToolCallLedgerRepo;
  readonly contextEpochs: ContextEpochLedgerRepo;
  readonly runtimeEvents: RuntimeEventLedgerRepo;
  private readonly db: Database.Database;

  constructor(rootDir: string) {
    const statePaths = getProjectStatePaths(rootDir);
    fs.mkdirSync(statePaths.kittyDir, { recursive: true });
    this.db = new Database(statePaths.controlPlaneLedgerFile);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.pragma("foreign_keys = ON");
    initializeControlPlaneSchema(this.db);
    this.executions = new ExecutionLedgerRepo(this.db);
    this.wakeSignals = new WakeSignalLedgerRepo(this.db);
    this.taskLifecycle = new TaskLifecycleLedgerRepo(this.db);
    this.sessions = new SessionLedgerRepo(this.db);
    this.turns = new TurnLedgerRepo(this.db);
    this.toolCalls = new ToolCallLedgerRepo(this.db);
    this.contextEpochs = new ContextEpochLedgerRepo(this.db);
    this.runtimeEvents = new RuntimeEventLedgerRepo(this.db);
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  close(): void {
    this.db.close();
  }
}
