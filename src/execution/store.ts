import { ControlPlaneLedger, type ExecutionRecord, type ExecutionStatus } from "../control/ledger.js";
import type { ExecutionKind } from "./kinds.js";
import type { LeadWaitPolicyInput } from "../protocol/leadWait.js";

export type { ExecutionKind, ExecutionRecord, ExecutionStatus };

export class ExecutionStore {
  constructor(private readonly rootDir: string) {}

  create(input: {
    kind: ExecutionKind;
    assignment?: ExecutionRecord["assignment"];
    command?: string;
    prompt?: string;
    cwd: string;
    requestedBy: string;
    actorName?: string;
    actorRole?: string;
    sessionId?: string;
    timeoutMs?: number;
    waitPolicy?: LeadWaitPolicyInput;
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
    try {
      return ledger.executions.load(id);
    } finally {
      ledger.close();
    }
  }

  list(input: {
    kind?: ExecutionKind;
    kinds?: readonly ExecutionKind[];
    statuses?: readonly ExecutionStatus[];
    cwd?: string;
  } = {}): ExecutionRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.list(input);
    } finally {
      ledger.close();
    }
  }

  markRunning(id: string, input: { pid: number; sessionId?: string }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const running = ledger.executions.markRunning(id, { pid: input.pid });
      return input.sessionId
        ? ledger.executions.save({ ...running, sessionId: input.sessionId })
        : running;
    } finally {
      ledger.close();
    }
  }

  close(id: string, input: {
    status: "completed" | "failed" | "aborted" | "stale" | "paused";
    exitCode?: number | null;
    output?: string;
    resultText?: string;
    summary?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const closed = ledger.executions.close(id, {
        status: input.status,
        exitCode: input.exitCode,
        output: input.output ?? input.resultText,
        summary: input.summary,
      });
      ledger.wakeSignals.publish({
        executionId: id,
        reason: input.status,
      });
      return closed;
    } finally {
      ledger.close();
    }
  }

  listWakeSignals() {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.wakeSignals.list();
    } finally {
      ledger.close();
    }
  }
}
