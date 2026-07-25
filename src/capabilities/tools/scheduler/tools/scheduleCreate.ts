import { jsonResult } from "../../../shared.js";
import { publishSchedulerEvent } from "../../../../scheduler/events.js";
import { ensureScheduledTaskRuntime } from "../../../../scheduler/runtime.js";
import { ScheduledTaskService } from "../../../../scheduler/service.js";
import { readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { parseScheduleToolArgs, readAction, readSchedule, scheduleProperties } from "../shared.js";

export const scheduleCreateTool: RegisteredTool = {
  effect: "state",
  parallelSafe: false,
  definition: {
    type: "function",
    function: {
      name: "schedule_create",
      description: "Create a durable machine-driven reminder or prewritten local command. Waiting never calls the model. Never use this to defer future Agent reasoning.",
      parameters: {
        type: "object",
        properties: scheduleProperties,
        required: ["name", "action_type", "schedule_type"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseScheduleToolArgs(rawArgs);
    const service = new ScheduledTaskService(context.projectContext.stateRootDir);
    const task = service.create({
      name: readString(args.name, "name"),
      action: readAction(args)!,
      schedule: readSchedule(args)!,
      creatorSessionId: context.ownerSessionId,
      cwd: context.cwd,
    });
    ensureScheduledTaskRuntime(context.projectContext.stateRootDir).reschedule();
    publishSchedulerEvent({ type: "task_changed", task });
    return jsonResult({ ok: true, task, tokenUsageWhileWaiting: 0 });
  },
};
