import { parseArgs, readString } from "../../../tools/core/shared.js";
import type { ScheduledAction, ScheduleSpec } from "../../../scheduler/types.js";

export function parseScheduleToolArgs(rawArgs: string): Record<string, unknown> {
  return parseArgs(rawArgs);
}

export function readAction(args: Record<string, unknown>, required = true): ScheduledAction | undefined {
  const type = args.action_type;
  if (type === undefined && !required) return undefined;
  if (type === "reminder") {
    return { type, text: readString(args.reminder_text, "reminder_text") };
  }
  if (type === "command") {
    return {
      type,
      command: readString(args.command, "command"),
      cwd: typeof args.cwd === "string" ? args.cwd : ".",
      timeoutMs: typeof args.timeout_ms === "number" ? args.timeout_ms : 600_000,
    };
  }
  throw new Error('Tool argument "action_type" must be "reminder" or "command".');
}

export function readSchedule(args: Record<string, unknown>, required = true): ScheduleSpec | undefined {
  const type = args.schedule_type;
  if (type === undefined && !required) return undefined;
  if (type === "once") return { type, runAt: readString(args.run_at, "run_at") };
  if (type === "interval") {
    if (typeof args.interval_minutes !== "number") throw new Error('Tool argument "interval_minutes" must be a number.');
    return { type, intervalMinutes: args.interval_minutes };
  }
  if (type === "daily") {
    return {
      type,
      time: readString(args.daily_time, "daily_time"),
      timezone: typeof args.timezone === "string" && args.timezone
        ? args.timezone
        : Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
  }
  throw new Error('Tool argument "schedule_type" must be "once", "interval", or "daily".');
}

export const scheduleProperties = {
  name: { type: "string", description: "Short user-visible task name." },
  action_type: { type: "string", enum: ["reminder", "command"] },
  reminder_text: { type: "string", description: "Exact reminder text; required for reminder actions." },
  command: { type: "string", description: "Exact prewritten local command; required for command actions." },
  cwd: { type: "string", description: "Command working directory, relative to the project by default." },
  timeout_ms: { type: "number", description: "Command timeout from 1000 to 86400000 ms." },
  schedule_type: { type: "string", enum: ["once", "interval", "daily"] },
  run_at: { type: "string", description: "ISO date-time for a one-time task." },
  interval_minutes: { type: "number", description: "Repeat interval in whole minutes, minimum 1." },
  daily_time: { type: "string", description: "Daily local time in HH:mm format." },
  timezone: { type: "string", description: "IANA timezone for daily schedules, e.g. Asia/Shanghai." },
} as const;
