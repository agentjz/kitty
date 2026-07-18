import { jsonResult } from "../../../shared.js";
import { publishSchedulerEvent } from "../../../../scheduler/events.js";
import { ensureScheduledTaskRuntime } from "../../../../scheduler/runtime.js";
import { ScheduledTaskService } from "../../../../scheduler/service.js";
import { readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { parseScheduleToolArgs, readAction, readSchedule, scheduleProperties } from "../shared.js";

export const scheduleUpdateTool: RegisteredTool = {
  effect: "state",
  parallelSafe: false,
  definition: {
    type: "function",
    function: {
      name: "schedule_update",
      description: "Update, enable, or disable a durable scheduled task. Provide action_type or schedule_type only when replacing that whole part.",
      parameters: {
        type: "object",
        properties: {
          id: { type: "string" },
          enabled: { type: "boolean" },
          ...scheduleProperties,
        },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseScheduleToolArgs(rawArgs);
    const service = new ScheduledTaskService(context.projectContext.stateRootDir);
    const task = service.update({
      id: readString(args.id, "id"),
      name: typeof args.name === "string" ? args.name : undefined,
      enabled: typeof args.enabled === "boolean" ? args.enabled : undefined,
      action: readAction(args, false),
      schedule: readSchedule(args, false),
      cwd: context.cwd,
    });
    ensureScheduledTaskRuntime(context.projectContext.stateRootDir).reschedule();
    publishSchedulerEvent({ type: "task_changed", task });
    return jsonResult({ ok: true, task });
  },
};
