import { jsonResult } from "../../../shared.js";
import { publishSchedulerEvent } from "../../../../scheduler/events.js";
import { ensureScheduledTaskRuntime } from "../../../../scheduler/runtime.js";
import { ScheduledTaskService } from "../../../../scheduler/service.js";
import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const scheduleDeleteTool: RegisteredTool = {
  effect: "state",
  parallelSafe: false,
  definition: {
    type: "function",
    function: {
      name: "schedule_delete",
      description: "Permanently delete a scheduled task that is not currently executing.",
      parameters: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const service = new ScheduledTaskService(context.projectContext.stateRootDir);
    const id = readString(args.id, "id");
    const deleted = service.delete(id);
    ensureScheduledTaskRuntime(context.projectContext.stateRootDir).reschedule();
    publishSchedulerEvent({ type: "task_changed" });
    return jsonResult({ ok: true, id, deleted });
  },
};
