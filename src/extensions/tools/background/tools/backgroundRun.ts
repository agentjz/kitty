import { launchCommand } from "../../../../utils/commandRunner/launch.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import { BackgroundExecutionStore } from "../../../../execution/background.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";

export const backgroundRunTool: RegisteredTool = {
  definition: {
    type: "function",
    function: {
      name: "background_run",
      description: "Start a background command and record its lifecycle in the local control plane.",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string" },
          cwd: { type: "string" },
          timeout_ms: { type: "number" },
        },
        required: ["command"],
        additionalProperties: false,
      },
    },
  },
  async execute(rawArgs, context) {
    const args = parseArgs(rawArgs);
    const command = readString(args.command, "command");
    const cwd = resolveUserPath(typeof args.cwd === "string" ? args.cwd : context.cwd, context.cwd);
    const timeoutMs = clampNumber(args.timeout_ms, 1_000, 86_400_000, 600_000);
    const store = new BackgroundExecutionStore(context.projectContext.stateRootDir);
    const job = store.create({
      command,
      cwd,
      requestedBy: context.identity.name,
      sessionId: context.sessionId,
      timeoutMs,
    });
    const { subprocess } = await launchCommand(command, cwd, timeoutMs);
    store.markRunning(job.id, { pid: subprocess.pid ?? 0 });

    void subprocess.then(async (result) => {
      store.close(job.id, {
        status: result.exitCode === 0 ? "completed" : "failed",
        exitCode: result.exitCode,
        output: typeof result.all === "string" ? result.all : undefined,
        summary: result.exitCode === 0 ? "Background command completed." : "Background command failed.",
      });
    }, async (error) => {
      store.close(job.id, {
        status: "failed",
        exitCode: typeof (error as { exitCode?: unknown }).exitCode === "number" ? (error as { exitCode: number }).exitCode : null,
        output: typeof (error as { all?: unknown }).all === "string" ? (error as { all: string }).all : String((error as Error).message),
        summary: "Background command failed.",
      });
    });

    const running = store.load(job.id);
    return okResult(JSON.stringify({
      id: job.id,
      command,
      cwd,
      pid: running?.pid,
      status: running?.status,
    }, null, 2), {
      runtime: {
        status: "completed",
        exitCode: 0,
        durationMs: 0,
        attempts: 1,
        timedOut: false,
        stalled: false,
        aborted: false,
        truncated: false,
        outputPreview: `background ${job.id}`,
      },
    });
  },
};
