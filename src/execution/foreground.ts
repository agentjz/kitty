import { executionOwnership, type ExecutionOwnership } from "../control/types.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { terminatePid, type ProcessIdentity } from "./process.js";
import { ExecutionStore } from "./store.js";

const HEARTBEAT_INTERVAL_MS = 10_000;

export interface ForegroundExecutionInput {
  stateRootDir: string;
  command: string;
  cwd: string;
  timeoutMs: number;
  requestedBy: string;
  ownerSessionId: string;
  createdBySessionId: string;
  parentTurnId: string;
  originToolCallId: string;
}

export interface ForegroundExecutionResult {
  exitCode: number | null;
  output: string;
  timedOut: boolean;
  aborted: boolean;
  stalled: boolean;
}

export class ForegroundExecutionController {
  private readonly store: ExecutionStore;
  private readonly id: string;
  private readonly ownership: ExecutionOwnership;
  private readonly stateRootDir: string;
  private heartbeatTimer?: NodeJS.Timeout;
  private identity?: ProcessIdentity;
  private settled = false;

  constructor(input: ForegroundExecutionInput) {
    this.stateRootDir = input.stateRootDir;
    this.store = new ExecutionStore(input.stateRootDir);
    const execution = this.store.create({
      kind: "foreground",
      command: input.command,
      cwd: input.cwd,
      timeoutMs: input.timeoutMs,
      requestedBy: input.requestedBy,
      ownerSessionId: input.ownerSessionId,
      createdBySessionId: input.createdBySessionId,
      parentTurnId: input.parentTurnId,
      originToolCallId: input.originToolCallId,
    });
    this.id = execution.id;
    this.ownership = executionOwnership(execution);
  }

  start(pid: number, identity: ProcessIdentity): void {
    this.identity = identity;
    this.store.markRunning(this.id, this.ownership, {
      pid,
      processIdentity: this.identity,
    });
    this.heartbeatTimer = setInterval(() => {
      try {
        const ledger = new ControlPlaneLedger(this.stateRootDir);
        try { ledger.executions.heartbeat(this.id, this.ownership); }
        finally { ledger.close(); }
      } catch {
        this.dispose();
        try { terminatePid(pid, this.identity); } catch { /* recovery will settle uncertain ownership */ }
      }
    }, HEARTBEAT_INTERVAL_MS);
    this.heartbeatTimer.unref();
  }

  settle(result: ForegroundExecutionResult): void {
    if (this.settled) return;
    this.settled = true;
    this.dispose();
    const status = result.aborted
      ? "aborted"
      : result.exitCode === 0 && !result.timedOut && !result.stalled
        ? "completed"
        : "failed";
    try {
      this.store.close(this.id, this.ownership, {
        status,
        exitCode: result.exitCode,
        output: result.output,
        summary: `Foreground command ${status}.`,
        closeReason: result.timedOut ? "timeout" : result.stalled ? "stall" : status,
      });
    } catch (error) {
      if (!isStaleControllerError(error)) throw error;
    }
  }

  failBeforeStart(error: unknown): void {
    if (this.settled) return;
    this.settled = true;
    this.dispose();
    try {
      this.store.close(this.id, this.ownership, {
        status: "failed",
        summary: "Foreground command failed before process registration.",
        closeReason: "launch_error",
        error: error instanceof Error ? error.message : String(error),
      });
    } catch (settlementError) {
      if (!isStaleControllerError(settlementError)) throw settlementError;
    }
  }

  settleUnexpectedExit(): void {
    if (this.settled) return;
    this.failBeforeStart(new Error("Foreground command runner exited before durable settlement."));
  }

  dispose(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }
}

function isStaleControllerError(error: unknown): boolean {
  return error instanceof Error && /stale (?:controller|version)|no longer owns/i.test(error.message);
}
