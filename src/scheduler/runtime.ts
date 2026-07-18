import { ControlPlaneLedger } from "../control/ledger.js";
import type { ServiceLeaseRecord } from "../control/serviceLeases.js";
import { ExecutionStore } from "../execution/store.js";
import { reconcileExecutions } from "../execution/lifecycle.js";
import { runCommandWithPolicy } from "../utils/commandRunner.js";
import { publishSchedulerEvent } from "./events.js";
import { ScheduledTaskService } from "./service.js";
import type { ScheduledTaskRecord, ScheduledTriggerRecord } from "./types.js";

const SERVICE_LEASE_MS = 30_000;
const HEARTBEAT_MS = 10_000;
const MAX_TIMER_MS = 2_147_000_000;

export class ScheduledTaskRuntime {
  private lease?: ServiceLeaseRecord;
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private stopped = true;
  private ticking = false;
  private readonly active = new Map<string, { controller: AbortController; settled: Promise<void> }>();
  private readonly service: ScheduledTaskService;

  constructor(private readonly rootDir: string) {
    this.service = new ScheduledTaskService(rootDir);
  }

  start(): boolean {
    if (!this.stopped) return Boolean(this.lease);
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      try {
        this.lease = ledger.serviceLeases.acquire({
          name: "scheduler",
          processId: process.pid,
          leaseMs: SERVICE_LEASE_MS,
        });
      } catch (error) {
        if (error instanceof Error && /already has an active owner/.test(error.message)) return false;
        throw error;
      }
    } finally {
      ledger.close();
    }
    this.stopped = false;
    this.heartbeat = setInterval(() => this.renewLease(), HEARTBEAT_MS);
    this.heartbeat.unref();
    this.reschedule(0);
    return true;
  }

  reschedule(delayOverride?: number): void {
    if (this.stopped || !this.lease) return;
    if (this.timer) clearTimeout(this.timer);
    const deadline = this.service.nextDeadline();
    const delay = delayOverride ?? (deadline
      ? Math.max(0, Math.min(MAX_TIMER_MS, new Date(deadline).getTime() - Date.now()))
      : MAX_TIMER_MS);
    this.timer = setTimeout(() => void this.tick(), delay);
    this.timer.unref();
  }

  async runOnce(now = new Date()): Promise<void> {
    await this.tick(now);
  }

  async stop(timeoutMs = 5_000): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.timer = undefined;
    this.heartbeat = undefined;
    for (const item of this.active.values()) item.controller.abort(new Error("Scheduler stopped."));
    await Promise.race([
      Promise.allSettled([...this.active.values()].map((item) => item.settled)),
      new Promise((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
    if (this.lease) {
      const ledger = new ControlPlaneLedger(this.rootDir);
      try { ledger.serviceLeases.release(this.lease); }
      finally { ledger.close(); }
    }
    this.lease = undefined;
  }

  private async tick(now = new Date()): Promise<void> {
    if (this.stopped || this.ticking || !this.lease) return;
    this.ticking = true;
    try {
      reconcileExecutions(this.rootDir);
      const recovered = this.reclaimExpiredTriggers(now);
      const fresh = this.service.claimDue(now);
      for (const trigger of recovered) this.launch(trigger, true);
      for (const trigger of fresh) this.launch(trigger, false);
    } finally {
      this.ticking = false;
      this.reschedule();
    }
  }

  private launch(trigger: ScheduledTriggerRecord, recovered: boolean): void {
    if (this.active.has(trigger.id) || this.stopped) return;
    const controller = new AbortController();
    const settled = this.execute(trigger, recovered, controller.signal)
      .catch(() => undefined)
      .finally(() => {
        this.active.delete(trigger.id);
        this.reschedule();
      });
    this.active.set(trigger.id, { controller, settled });
  }

  private async execute(trigger: ScheduledTriggerRecord, recovered: boolean, signal: AbortSignal): Promise<void> {
    const ledger = new ControlPlaneLedger(this.rootDir);
    let task: ScheduledTaskRecord | undefined;
    try { task = ledger.scheduledTasks.load(trigger.taskId); }
    finally { ledger.close(); }
    if (!task) return;

    if (task.action.type === "reminder") {
      this.settle(trigger, {
        status: "succeeded",
        result: { type: "reminder", text: task.action.text },
      });
      return;
    }

    const existing = new ExecutionStore(this.rootDir).list({ originToolCallIds: [trigger.id] }).at(-1);
    if (recovered && existing) {
      if (existing.status === "completed") {
        this.linkAndSettle(trigger, existing.id, "succeeded", {
          type: "command",
          exitCode: existing.exitCode ?? 0,
          output: existing.output ?? "",
          recovered: true,
        });
      } else {
        this.linkAndSettle(trigger, existing.id, "uncertain", undefined,
          `Command crossed a process interruption boundary with execution status ${existing.status}; it was not replayed.`);
      }
      return;
    }

    const heartbeat = setInterval(() => this.heartbeatTrigger(trigger), HEARTBEAT_MS);
    heartbeat.unref();
    try {
      const result = await runCommandWithPolicy({
        command: task.action.command,
        cwd: task.action.cwd,
        timeoutMs: task.action.timeoutMs,
        stallTimeoutMs: 0,
        abortSignal: signal,
        outputCapture: { stateRootDir: this.rootDir, sessionId: task.creatorSessionId },
        execution: {
          stateRootDir: this.rootDir,
          requestedBy: "scheduler",
          ownerSessionId: task.creatorSessionId ?? "scheduler",
          createdBySessionId: task.creatorSessionId ?? "scheduler",
          parentTurnId: `scheduled-task:${task.id}`,
          originToolCallId: trigger.id,
        },
      });
      const execution = new ExecutionStore(this.rootDir).list({ originToolCallIds: [trigger.id] }).at(-1);
      if (!execution) {
        this.settle(trigger, { status: "uncertain", error: "Command finished without a durable execution record." });
        return;
      }
      const status = result.aborted ? "interrupted" : result.exitCode === 0 ? "succeeded" : "failed";
      this.linkAndSettle(trigger, execution.id, status, {
        type: "command",
        exitCode: result.exitCode,
        output: result.output,
        timedOut: result.timedOut,
        aborted: result.aborted,
      }, status === "failed" ? `Command exited with code ${String(result.exitCode)}.` : undefined);
    } catch (error) {
      const execution = new ExecutionStore(this.rootDir).list({ originToolCallIds: [trigger.id] }).at(-1);
      this.settle(trigger, {
        status: execution ? "uncertain" : "failed",
        executionId: execution?.id,
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearInterval(heartbeat);
    }
  }

  private reclaimExpiredTriggers(now = new Date()): ScheduledTriggerRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.scheduledTasks.reclaimExpired(now); }
    finally { ledger.close(); }
  }

  private heartbeatTrigger(trigger: ScheduledTriggerRecord): void {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { ledger.scheduledTasks.heartbeat(trigger); }
    finally { ledger.close(); }
  }

  private linkAndSettle(
    trigger: ScheduledTriggerRecord,
    executionId: string,
    status: "succeeded" | "failed" | "interrupted" | "uncertain",
    result?: Record<string, unknown>,
    error?: string,
  ): void {
    this.settle(trigger, { status, result, error, executionId });
  }

  private settle(trigger: ScheduledTriggerRecord, input: {
    status: "succeeded" | "failed" | "interrupted" | "uncertain";
    result?: Record<string, unknown>;
    error?: string;
    executionId?: string;
  }): void {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const settled = ledger.scheduledTasks.settle({
        id: trigger.id,
        claimToken: trigger.claimToken,
        ...input,
      });
      publishSchedulerEvent({ type: "trigger_settled", trigger: settled });
    } finally {
      ledger.close();
    }
  }

  private renewLease(): void {
    if (!this.lease || this.stopped) return;
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      this.lease = ledger.serviceLeases.heartbeat(this.lease, SERVICE_LEASE_MS);
    } catch {
      void this.stop();
    } finally {
      ledger.close();
    }
  }
}

const runtimes = new Map<string, ScheduledTaskRuntime>();

export function ensureScheduledTaskRuntime(rootDir: string): ScheduledTaskRuntime {
  let runtime = runtimes.get(rootDir);
  if (!runtime) {
    runtime = new ScheduledTaskRuntime(rootDir);
    runtimes.set(rootDir, runtime);
  }
  runtime.start();
  return runtime;
}
