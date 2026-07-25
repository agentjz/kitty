import { jsonResult } from "../../../shared.js";
import { ScheduledTaskService } from "../../../../scheduler/service.js";
import { parseArgs } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const scheduleListTool: RegisteredTool = {
  effect: "read",
  parallelSafe: true,
  definition: {
    type: "function",
    function: {
      name: "schedule_list",
      description: "List durable scheduled tasks and optionally their recent trigger results.",
      parameters: {
        type: "object",
        properties: {
          include_triggers: { type: "boolean" },
          task_id: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const service = new ScheduledTaskService(context.projectContext.stateRootDir);
    const tasks = service.list();
    const includeTriggers = args.include_triggers === true;
    return jsonResult({
      tasks,
      triggers: includeTriggers ? service.listTriggers(typeof args.task_id === "string" ? args.task_id : undefined) : undefined,
      tokenUsageWhileWaiting: 0,
    });
  },
};
