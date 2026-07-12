import { buildLoadedSkillPayload } from "../../../../skills/loading.js";
import { ControlPlaneLedger } from "../../../../control/ledger.js";
import { recordObservabilityEvent } from "../../../../observability/writer.js";
import { jsonResult } from "../../../shared.js";
import { parseArgs, readString } from "../../../../tools/core/shared.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const skillLoadTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "skill_load",
      description: "Load the full content of one project runtime skill when the model decides the current task needs that method.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Exact skill name from skill_list or the available skills runtime facts.",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name").trim();
    const skill = context.projectContext.skills.find((item) => item.name === name);
    if (!skill) {
      const available = context.projectContext.skills.map((item) => item.name);
      throw new Error(
        available.length > 0
          ? `Unknown skill "${name}". Available skills: ${available.join(", ")}.`
          : `Unknown skill "${name}". No project runtime skills are available.`,
      );
    }

    await recordSkillUse(context.projectContext.stateRootDir, {
      sessionId: context.sessionId,
      action: "load",
      skillName: skill.name,
    });

    return jsonResult(buildLoadedSkillPayload(skill));
  },
};

async function recordSkillUse(rootDir: string, input: {
  sessionId: string;
  action: string;
  skillName: string;
}): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "skill.usage",
    status: "completed",
    sessionId: input.sessionId,
    details: {
      action: input.action,
      skillName: input.skillName,
    },
  });
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    const current = ledger.taskLifecycle.loadCurrent(input.sessionId);
    ledger.taskLifecycle.update({
      sessionId: input.sessionId,
      reason: "skill.usage",
      verificationFacts: [
        ...(current?.verificationFacts ?? []),
        `skill ${input.action}: ${input.skillName}`,
      ],
    });
  } finally {
    ledger.close();
  }
}
