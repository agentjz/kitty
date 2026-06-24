import { launchCommand } from "../../../../utils/commandRunner/launch.js";
import { normalizeCommandOutput } from "../../../../utils/commandRunner/output.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import { BackgroundExecutionStore, registerBackgroundProcess } from "../../../../execution/background.js";
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
    registerBackgroundProcess(job.id, subprocess);
    store.markRunning(job.id, { pid: subprocess.pid ?? 0 });
    const outputTracker = createBackgroundOutputTracker((output) => {
      const normalizedOutput = normalizeCommandOutput(output);
      store.updateRunningOutput(job.id, {
        output: normalizedOutput,
        summary: summarizeBackgroundOutput(normalizedOutput),
        lastOutputAt: new Date().toISOString(),
      });
    });
    subprocess.all?.on("data", (chunk) => {
      outputTracker.append(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    });

    void subprocess.then(async (result) => {
      outputTracker.flush();
      const running = store.load(job.id);
      const resultOutput = normalizeCommandOutput(typeof result.all === "string" ? result.all : "");
      const output = resultOutput || running?.output || "";
      store.close(job.id, {
        status: result.exitCode === 0 ? "completed" : "failed",
        exitCode: result.exitCode,
        output,
        summary: summarizeBackgroundOutput(output) ?? (result.exitCode === 0 ? "Background command completed." : "Background command failed."),
        closeReason: result.exitCode === 0 ? "completed" : "exit_code",
      });
    }, async (error) => {
      outputTracker.flush();
      const running = store.load(job.id);
      const errorOutput = normalizeCommandOutput(typeof (error as { all?: unknown }).all === "string" ? (error as { all: string }).all : "");
      const output = errorOutput || running?.output || String((error as Error).message);
      store.close(job.id, {
        status: "failed",
        exitCode: typeof (error as { exitCode?: unknown }).exitCode === "number" ? (error as { exitCode: number }).exitCode : null,
        output,
        summary: summarizeBackgroundOutput(output) ?? "Background command failed.",
        closeReason: Boolean((error as { timedOut?: unknown }).timedOut) ? "timeout" : "error",
        error: error instanceof Error ? error.message : String(error),
      });
    });

    const running = store.load(job.id);
    return okResult(JSON.stringify({
      id: job.id,
      command,
      cwd,
      pid: running?.pid,
      status: running?.status,
      deadlineAt: running?.deadlineAt,
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

const BACKGROUND_OUTPUT_PREVIEW_CHARS = 4_000;
const BACKGROUND_OUTPUT_UPDATE_CHARS = 240;

function createBackgroundOutputTracker(onOutput: (output: string) => void): {
  append: (chunk: string) => void;
  flush: () => void;
} {
  let buffer = "";
  let lastPublishedLength = 0;

  return {
    append(chunk) {
      if (!chunk) {
        return;
      }
      buffer = truncateHead(`${buffer}${chunk}`, BACKGROUND_OUTPUT_PREVIEW_CHARS);
      if (buffer.length - lastPublishedLength >= BACKGROUND_OUTPUT_UPDATE_CHARS) {
        lastPublishedLength = buffer.length;
        onOutput(buffer);
      }
    },
    flush() {
      if (buffer.length > 0 && buffer.length !== lastPublishedLength) {
        lastPublishedLength = buffer.length;
        onOutput(buffer);
      }
    },
  };
}

function summarizeBackgroundOutput(output: string): string | undefined {
  const normalized = output
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(-3)
    .join(" | ");
  return normalized ? truncateHead(normalized, 240) : undefined;
}

function truncateHead(value: string, maxChars: number): string {
  return value.length <= maxChars ? value : value.slice(value.length - maxChars);
}
