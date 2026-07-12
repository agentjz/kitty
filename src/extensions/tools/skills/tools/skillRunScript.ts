import path from "node:path";

import { jsonResult } from "../../../shared.js";
import { ControlPlaneLedger } from "../../../../control/ledger.js";
import { recordObservabilityEvent } from "../../../../observability/writer.js";
import { clampNumber, parseArgs, readString } from "../../../../tools/core/shared.js";
import { runCommandWithPolicy } from "../../../../utils/commandRunner.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const skillRunScriptTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "skill_run_script",
      description: "Run one declared script resource from a project runtime skill package.",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "Exact skill name from skill_list or the available skills runtime facts.",
          },
          path: {
            type: "string",
            description: "Script resource path from the selected skill summary. Must be under scripts/.",
          },
          args: {
            type: "string",
            description: "Optional argument string appended after the script path.",
          },
          timeout_ms: {
            type: "number",
            description: "Optional timeout in milliseconds.",
          },
        },
        required: ["name", "path"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const name = readString(args.name, "name").trim();
    const requestedPath = readString(args.path, "path").trim();
    const skill = context.projectContext.skills.find((item) => item.name === name);
    if (!skill) {
      throw new Error(`Unknown skill "${name}".`);
    }

    const resource = skill.resources.find((item) => normalizeResourcePath(item.path) === normalizeResourcePath(requestedPath));
    if (!resource) {
      throw new Error(`Skill "${name}" does not declare script resource: ${requestedPath}`);
    }

    const skillDir = path.dirname(skill.path);
    const relativeToSkill = normalizeResourcePath(path.relative(skillDir, resource.path));
    if (!relativeToSkill.startsWith("scripts/")) {
      throw new Error(`Skill "${name}" resource is not executable because it is outside scripts/: ${requestedPath}`);
    }

    const scriptPath = path.resolve(context.projectContext.rootDir, resource.path);
    const argumentText = typeof args.args === "string" ? args.args.trim() : "";
    const command = buildScriptCommand(scriptPath, argumentText);
    const result = await runCommandWithPolicy({
      command,
      cwd: context.cwd,
      timeoutMs: clampNumber(args.timeout_ms, 1_000, 600_000, 120_000),
      stallTimeoutMs: clampNumber(context.config.commandStallTimeoutMs, 2_000, 300_000, 30_000),
      abortSignal: context.abortSignal,
      outputCapture: {
        stateRootDir: context.projectContext.stateRootDir,
        sessionId: context.sessionId,
      },
    });
    await recordSkillScriptUse(context.projectContext.stateRootDir, {
      sessionId: context.sessionId,
      skillName: skill.name,
      scriptPath: resource.path,
      ok: result.exitCode === 0 && !result.timedOut && !result.aborted && !result.stalled,
    });

    return jsonResult({
      ok: result.exitCode === 0 && !result.timedOut && !result.aborted && !result.stalled,
      skill: {
        name: skill.name,
        path: skill.path,
      },
      script: resource,
      command,
      exitCode: result.exitCode,
      durationMs: result.durationMs,
      timedOut: result.timedOut,
      stalled: result.stalled,
      aborted: result.aborted,
      truncated: result.truncated,
      outputPath: result.outputPath,
      output: result.output,
    });
  },
};

function normalizeResourcePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function recordSkillScriptUse(rootDir: string, input: {
  sessionId: string;
  skillName: string;
  scriptPath: string;
  ok: boolean;
}): Promise<void> {
  await recordObservabilityEvent(rootDir, {
    event: "skill.script",
    status: input.ok ? "completed" : "failed",
    sessionId: input.sessionId,
    details: {
      skillName: input.skillName,
      scriptPath: input.scriptPath,
    },
  });
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    const current = ledger.taskLifecycle.loadCurrent(input.sessionId);
    ledger.taskLifecycle.update({
      sessionId: input.sessionId,
      reason: "skill.script",
      verificationFacts: [
        ...(current?.verificationFacts ?? []),
        `skill script ${input.ok ? "completed" : "failed"}: ${input.skillName} ${input.scriptPath}`,
      ],
    });
  } finally {
    ledger.close();
  }
}

function quotePath(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function buildScriptCommand(scriptPath: string, argumentText: string): string {
  const extension = path.extname(scriptPath).toLowerCase();
  const quoted = quotePath(scriptPath);
  const suffix = argumentText ? ` ${argumentText}` : "";
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") {
    return `node ${quoted}${suffix}`;
  }
  if (extension === ".ps1") {
    return `powershell -NoProfile -ExecutionPolicy Bypass -File ${quoted}${suffix}`;
  }
  if (extension === ".py") {
    return `python ${quoted}${suffix}`;
  }
  return `${quoted}${suffix}`;
}
