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
import { InteractionDraftLedgerRepo } from "./interactionDrafts.js";
import { TurnSteerLedgerRepo } from "./turnSteers.js";
import { ServiceLeaseLedgerRepo } from "./serviceLeases.js";
import { RemoteMessageLedgerRepo } from "./remoteMessages.js";
import { ScheduledTaskLedgerRepo } from "./scheduledTasks.js";
import { openControlDatabase, type ControlDatabase } from "./sqlite.js";

export type {
  ExecutionRecord,
  ExecutionOwnership,
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
  readonly interactionDrafts: InteractionDraftLedgerRepo;
  readonly turnSteers: TurnSteerLedgerRepo;
  readonly serviceLeases: ServiceLeaseLedgerRepo;
  readonly remoteMessages: RemoteMessageLedgerRepo;
  readonly scheduledTasks: ScheduledTaskLedgerRepo;
  private readonly db: ControlDatabase;

  constructor(rootDir: string) {
    const statePaths = getProjectStatePaths(rootDir);
    fs.mkdirSync(statePaths.kittyDir, { recursive: true });
    this.db = openControlDatabase(statePaths.controlPlaneLedgerFile);
    this.db.exec("PRAGMA busy_timeout = 5000");
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec("PRAGMA synchronous = FULL");
    this.db.exec("PRAGMA foreign_keys = OFF");
    initializeControlPlaneSchema(this.db);
    this.db.exec("PRAGMA foreign_keys = ON");
    this.executions = new ExecutionLedgerRepo(this.db);
    this.wakeSignals = new WakeSignalLedgerRepo(this.db);
    this.taskLifecycle = new TaskLifecycleLedgerRepo(this.db);
    this.sessions = new SessionLedgerRepo(this.db);
    this.turns = new TurnLedgerRepo(this.db);
    this.toolCalls = new ToolCallLedgerRepo(this.db);
    this.contextEpochs = new ContextEpochLedgerRepo(this.db);
    this.runtimeEvents = new RuntimeEventLedgerRepo(this.db);
    this.interactionDrafts = new InteractionDraftLedgerRepo(this.db);
    this.turnSteers = new TurnSteerLedgerRepo(this.db);
    this.serviceLeases = new ServiceLeaseLedgerRepo(this.db);
    this.remoteMessages = new RemoteMessageLedgerRepo(this.db);
    this.scheduledTasks = new ScheduledTaskLedgerRepo(this.db);
  }

  transaction<T>(operation: () => T): T {
    return this.db.transaction(operation)();
  }

  resetRuntimeState(): void {
    const reset = this.db.transaction(() => {
      const now = new Date().toISOString();
      const activeTurn = this.db.prepare(`
        SELECT id FROM session_turns
        WHERE status IN ('running', 'closing') AND lease_expires_at > ? LIMIT 1
      `).get(now) as { id: string } | undefined;
      const activeExecution = this.db.prepare(`
        SELECT id FROM executions
        WHERE status IN ('created', 'running', 'cancelling') LIMIT 1
      `).get() as { id: string } | undefined;
      if (activeTurn || activeExecution) {
        throw new Error(`Project reset refused while lifecycle owners are active: ${activeTurn?.id ?? activeExecution?.id}.`);
      }
      for (const table of [
        "turn_steers", "tool_calls", "context_epochs", "interaction_drafts", "runtime_events",
        "remote_inbox", "remote_outbox", "scheduled_triggers", "scheduled_tasks", "service_leases",
        "task_lifecycle", "session_turns", "session_messages", "wake_signals", "executions", "sessions",
      ]) {
        this.db.prepare(`DELETE FROM ${table}`).run();
      }
    });
    reset.exclusive();
  }

  close(): void {
    this.db.close();
  }
}
