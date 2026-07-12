import { ControlPlaneLedger, type ExecutionRecord, type ExecutionStatus } from "../control/ledger.js";
import type { ExecutionOwnership } from "../control/types.js";
import type { ExecutionKind } from "./kinds.js";

export type { ExecutionKind, ExecutionRecord, ExecutionStatus };

export class ExecutionStore {
  constructor(private readonly rootDir: string) {}

  create(input: {
    kind?: ExecutionKind;
    command: string;
    cwd: string;
    requestedBy: string;
    ownerSessionId: string;
    createdBySessionId: string;
    parentTurnId: string;
    originToolCallId: string;
    timeoutMs?: number;
    deadlineAt?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.create(input);
    } finally {
      ledger.close();
    }
  }

  load(id: string): ExecutionRecord | undefined {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.executions.load(id); } finally { ledger.close(); }
  }

  loadOwned(id: string, ownerSessionId: string): ExecutionRecord | undefined {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.executions.loadOwned(id, ownerSessionId); } finally { ledger.close(); }
  }

  list(input: {
    statuses?: readonly ExecutionStatus[];
    cwd?: string;
    ownerSessionId?: string;
    createdBySessionId?: string;
    parentTurnId?: string;
    originToolCallIds?: readonly string[];
  } = {}): ExecutionRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.executions.list(input); } finally { ledger.close(); }
  }

  markRunning(id: string, ownership: ExecutionOwnership, input: { pid: number; processIdentity?: Record<string, unknown> }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.executions.markRunning(id, ownership, input); } finally { ledger.close(); }
  }

  close(id: string, ownership: ExecutionOwnership, input: {
    status: "completed" | "failed" | "aborted" | "lost";
    exitCode?: number | null;
    output?: string;
    resultText?: string;
    summary?: string;
    closeReason?: string;
    terminatedBy?: string;
    error?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.transaction(() => {
        const closed = ledger.executions.close(id, ownership, {
          ...input,
          output: input.output ?? input.resultText,
        });
        ledger.wakeSignals.publish({ executionId: id, reason: closed.status as typeof input.status });
        return closed;
      });
    } finally {
      ledger.close();
    }
  }

  listWakeSignals() {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.wakeSignals.list(); } finally { ledger.close(); }
  }
}
