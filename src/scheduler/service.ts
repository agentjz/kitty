import path from "node:path";

import { ControlPlaneLedger } from "../control/ledger.js";
import type {
  ScheduledAction,
  ScheduledTaskRecord,
  ScheduledTriggerRecord,
  ScheduleSpec,
} from "./types.js";

export interface CreateScheduledTaskInput {
  name: string;
  action: ScheduledAction;
  schedule: ScheduleSpec;
  enabled?: boolean;
  creatorSessionId?: string;
  cwd: string;
  now?: Date;
}

export interface UpdateScheduledTaskInput {
  id: string;
  name?: string;
  action?: ScheduledAction;
  schedule?: ScheduleSpec;
  enabled?: boolean;
  cwd: string;
  now?: Date;
}

export class ScheduledTaskService {
  constructor(private readonly rootDir: string) {}

  create(input: CreateScheduledTaskInput): ScheduledTaskRecord {
    const now = input.now ?? new Date();
    const action = normalizeAction(input.action, input.cwd);
    const schedule = normalizeSchedule(input.schedule);
    const enabled = input.enabled !== false;
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      return ledger.scheduledTasks.create({
        name: normalizeName(input.name),
        enabled,
        action,
        schedule,
        nextRunAt: enabled ? calculateNextRun(schedule, now) : undefined,
        creatorSessionId: input.creatorSessionId,
        lastTriggerAt: undefined,
      });
    } finally {
      ledger.close();
    }
  }

  update(input: UpdateScheduledTaskInput): ScheduledTaskRecord {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const current = ledger.scheduledTasks.load(input.id);
      if (!current) throw new Error(`Unknown scheduled task: ${input.id}.`);
      const now = input.now ?? new Date();
      const schedule = input.schedule ? normalizeSchedule(input.schedule) : current.schedule;
      const enabled = input.enabled ?? current.enabled;
      const scheduleChanged = input.schedule !== undefined;
      const enabledChanged = input.enabled !== undefined && input.enabled !== current.enabled;
      const nextRunAt = !enabled
        ? undefined
        : scheduleChanged || enabledChanged || !current.nextRunAt
          ? calculateNextRun(schedule, now)
          : current.nextRunAt;
      return ledger.scheduledTasks.save({
        ...current,
        name: input.name === undefined ? current.name : normalizeName(input.name),
        action: input.action ? normalizeAction(input.action, input.cwd) : current.action,
        schedule,
        enabled,
        nextRunAt,
      });
    } finally {
      ledger.close();
    }
  }

  delete(id: string): boolean {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const exists = Boolean(ledger.scheduledTasks.load(id));
      const deleted = ledger.scheduledTasks.delete(id);
      if (exists && !deleted) throw new Error(`Scheduled task ${id} is currently executing.`);
      return deleted;
    }
    finally { ledger.close(); }
  }

  load(id: string): ScheduledTaskRecord | undefined {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.scheduledTasks.load(id); }
    finally { ledger.close(); }
  }

  list(): ScheduledTaskRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.scheduledTasks.list(); }
    finally { ledger.close(); }
  }

  listTriggers(taskId?: string, limit?: number): ScheduledTriggerRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.scheduledTasks.listTriggers(taskId, limit); }
    finally { ledger.close(); }
  }

  claimDue(now = new Date()): ScheduledTriggerRecord[] {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try {
      const claimed: ScheduledTriggerRecord[] = [];
      for (const task of ledger.scheduledTasks.listDue(now)) {
        const scheduledFor = task.nextRunAt!;
        const nextRunAt = task.schedule.type === "once"
          ? undefined
          : calculateNextRun(task.schedule, now, new Date(scheduledFor));
        const trigger = ledger.scheduledTasks.claim({
          taskId: task.id,
          scheduledFor,
          nextRunAt,
          now,
        });
        if (trigger) claimed.push(trigger);
      }
      return claimed;
    } finally {
      ledger.close();
    }
  }

  nextDeadline(): string | undefined {
    const ledger = new ControlPlaneLedger(this.rootDir);
    try { return ledger.scheduledTasks.nextDeadline(); }
    finally { ledger.close(); }
  }
}

export function calculateNextRun(schedule: ScheduleSpec, now = new Date(), previous?: Date): string {
  if (schedule.type === "once") {
    const runAt = parseDate(schedule.runAt, "runAt");
    if (runAt.getTime() < now.getTime() - 60_000) {
      throw new Error("One-time schedule must not be more than one minute in the past.");
    }
    return runAt.toISOString();
  }
  if (schedule.type === "interval") {
    const intervalMs = schedule.intervalMinutes * 60_000;
    let next = (previous?.getTime() ?? now.getTime()) + intervalMs;
    while (next <= now.getTime()) next += intervalMs;
    return new Date(next).toISOString();
  }
  return findNextDaily(schedule.time, schedule.timezone, now).toISOString();
}

function normalizeAction(action: ScheduledAction, cwd: string): ScheduledAction {
  if (action.type === "reminder") {
    const text = action.text.trim();
    if (!text) throw new Error("Reminder text must not be empty.");
    return { type: "reminder", text };
  }
  if (action.type !== "command") throw new Error("Scheduled action must be reminder or command.");
  const command = action.command.trim();
  if (!command) throw new Error("Scheduled command must not be empty.");
  const timeoutMs = Math.trunc(action.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 86_400_000) {
    throw new Error("Scheduled command timeout must be between 1000 and 86400000 milliseconds.");
  }
  return {
    type: "command",
    command,
    cwd: path.resolve(cwd, action.cwd || "."),
    timeoutMs,
  };
}

function normalizeSchedule(schedule: ScheduleSpec): ScheduleSpec {
  if (schedule.type === "once") {
    return { type: "once", runAt: parseDate(schedule.runAt, "runAt").toISOString() };
  }
  if (schedule.type === "interval") {
    const intervalMinutes = Math.trunc(schedule.intervalMinutes);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes < 1 || intervalMinutes > 525_600) {
      throw new Error("Interval must be between 1 and 525600 minutes.");
    }
    return { type: "interval", intervalMinutes };
  }
  if (schedule.type !== "daily" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) {
    throw new Error("Daily time must use HH:mm in 24-hour format.");
  }
  assertTimeZone(schedule.timezone);
  return { type: "daily", time: schedule.time, timezone: schedule.timezone };
}

function findNextDaily(time: string, timezone: string, now: Date): Date {
  const [hour, minute] = time.split(":").map(Number);
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
  });
  let candidate = new Date(Math.floor(now.getTime() / 60_000) * 60_000 + 60_000);
  const limit = candidate.getTime() + 8 * 24 * 60 * 60_000;
  while (candidate.getTime() <= limit) {
    const parts = Object.fromEntries(formatter.formatToParts(candidate).map((part) => [part.type, part.value]));
    if (Number(parts.hour) % 24 === hour && Number(parts.minute) === minute) return candidate;
    candidate = new Date(candidate.getTime() + 60_000);
  }
  throw new Error(`Could not find the next ${time} in timezone ${timezone}.`);
}

function assertTimeZone(timezone: string): void {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); }
  catch { throw new Error(`Invalid timezone: ${timezone}.`); }
}

function parseDate(value: string, field: string): Date {
  const date = new Date(value);
  if (!value || !Number.isFinite(date.getTime())) throw new Error(`${field} must be a valid ISO date-time.`);
  return date;
}

function normalizeName(name: string): string {
  const value = name.trim();
  if (!value) throw new Error("Scheduled task name must not be empty.");
  if (value.length > 120) throw new Error("Scheduled task name must be at most 120 characters.");
  return value;
}
