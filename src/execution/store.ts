import { ControlPlaneLedger, type ExecutionRecord, type ExecutionStatus } from "../control/ledger.js";
import type { ExecutionKind } from "./kinds.js";
import type { LeadWaitPolicyInput } from "./leadWaitPolicy.js";

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

  heartbeat(id: string, ownerToken: string): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.heartbeat(id, ownerToken);
    } finally {
      ledger.close();
    }
  }

  requestCancellation(id: string): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.executions.requestCancellation(id);
    } finally {
      ledger.close();
    }
  }

  close(id: string, input: {
    status: "completed" | "failed" | "aborted" | "lost";
    exitCode?: number | null;
    output?: string;
    resultText?: string;
    summary?: string;
    closeReason?: string;
    terminatedBy?: string;
    changedPaths?: readonly string[];
    error?: string;
    ownerToken?: string;
  }): ExecutionRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.transaction(() => {
        const closed = ledger.executions.close(id, {
          status: input.status,
          exitCode: input.exitCode,
          output: input.output ?? input.resultText,
          summary: input.summary,
          closeReason: input.closeReason,
          terminatedBy: input.terminatedBy,
          changedPaths: input.changedPaths,
          error: input.error,
          ownerToken: input.ownerToken,
        });
        ledger.wakeSignals.publish({
          executionId: id,
          reason: closed.status as typeof input.status,
        });
        return closed;
      });
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
