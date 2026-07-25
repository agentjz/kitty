import { launchCommand } from "../../../../utils/commandRunner/launch.js";
import { normalizeCommandOutput } from "../../../../utils/commandRunner/output.js";
import { resolveUserPath } from "../../../../utils/fs.js";
import { clampNumber, okResult, parseArgs, readString } from "../../../../tools/core/shared.js";
import { BackgroundExecutionStore, registerBackgroundProcess, terminateBackgroundExecution } from "../../../../execution/background.js";
import type { RegisteredTool } from "../../../../tools/core/types.js";
import { executionOwnership } from "../../../../control/types.js";
import { registerBackgroundExecutionObserver } from "../../../../execution/backgroundSignals.js";

export const backgroundRunTool: RegisteredTool = {
  effect: "process",
  definition: {
    type: "function",
    function: {
      name: "background_run",
      description: "Start a long-running local command without blocking the current turn, and record its lifecycle in the local control plane.",
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
      requestedBy: "agent",
      ownerSessionId: context.ownerSessionId,
      createdBySessionId: context.sessionId,
      parentTurnId: context.turnId,
      originToolCallId: context.toolCallId,
      timeoutMs,
    });
    const ownership = executionOwnership(job);
    let launched: Awaited<ReturnType<typeof launchCommand>>;
    try {
      launched = await launchCommand(command, cwd, timeoutMs);
    } catch (error) {
      store.close(job.id, ownership, {
        status: "failed",
        summary: "Background command failed before process registration.",
        closeReason: "launch_error",
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
    const { subprocess, processIdentity, stopParentDeathWatchdog } = launched;
    registerBackgroundProcess(job.id, subprocess, stopParentDeathWatchdog);
    try {
      if (typeof subprocess.pid !== "number" || subprocess.pid <= 0) {
        throw new Error("Background command started without a process identifier.");
      }
      const running = store.markRunning(job.id, ownership, { pid: subprocess.pid, processIdentity });
      registerBackgroundExecutionObserver({
        rootDir: context.projectContext.stateRootDir,
        execution: running,
        consumerId: context.turnId,
      });
    } catch (error) {
      try { terminateBackgroundExecution(context.projectContext.stateRootDir, job.id, context.ownerSessionId); }
      catch { /* durable recovery owns the remaining uncertain launch */ }
      throw error;
    }
    const heartbeat = setInterval(() => {
      try { store.heartbeat(job.id, ownership); }
      catch (error) {
        clearInterval(heartbeat);
        if (!isStaleControllerError(error) && !(error instanceof Error && /no longer owns/i.test(error.message))) {
          try { terminateBackgroundExecution(context.projectContext.stateRootDir, job.id, context.ownerSessionId); }
          catch { /* durable recovery will reconcile an unconfirmed termination */ }
        }
      }
    }, 10_000);
    heartbeat.unref();
    const outputTracker = createBackgroundOutputTracker((output) => {
      const normalizedOutput = normalizeCommandOutput(output);
      try {
        store.updateRunningOutput(job.id, ownership, {
          output: normalizedOutput,
          summary: summarizeBackgroundOutput(normalizedOutput),
          lastOutputAt: new Date().toISOString(),
        });
      } catch (error) {
        if (!isStaleControllerError(error)) {
          try { terminateBackgroundExecution(context.projectContext.stateRootDir, job.id, context.ownerSessionId); }
          catch { /* expired lease recovery will settle an unconfirmed controller */ }
        }
      }
    });
    subprocess.all?.on("data", (chunk) => {
      outputTracker.append(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    });

    void subprocess.then(async (result) => {
      clearInterval(heartbeat);
      outputTracker.flush();
      const running = store.load(job.id);
      const resultOutput = normalizeCommandOutput(typeof result.all === "string" ? result.all : "");
      const output = resultOutput || running?.output || "";
      try {
        store.close(job.id, ownership, {
          status: result.exitCode === 0 ? "completed" : "failed",
          exitCode: result.exitCode,
          output,
          summary: summarizeBackgroundOutput(output) ?? (result.exitCode === 0 ? "Background command completed." : "Background command failed."),
          closeReason: result.exitCode === 0 ? "completed" : "exit_code",
        });
      } catch (error) {
        if (!isStaleControllerError(error)) {
          try { terminateBackgroundExecution(context.projectContext.stateRootDir, job.id, context.ownerSessionId); }
          catch { /* expired lease recovery will settle an unconfirmed controller */ }
        }
      }
    }, async (error) => {
      clearInterval(heartbeat);
      outputTracker.flush();
      const running = store.load(job.id);
      const errorOutput = normalizeCommandOutput(typeof (error as { all?: unknown }).all === "string" ? (error as { all: string }).all : "");
      const output = errorOutput || running?.output || String((error as Error).message);
      try {
        store.close(job.id, ownership, {
          status: "failed",
          exitCode: typeof (error as { exitCode?: unknown }).exitCode === "number" ? (error as { exitCode: number }).exitCode : null,
          output,
          summary: summarizeBackgroundOutput(output) ?? "Background command failed.",
          closeReason: Boolean((error as { timedOut?: unknown }).timedOut) ? "timeout" : "error",
          error: error instanceof Error ? error.message : String(error),
        });
      } catch (settlementError) {
        if (!isStaleControllerError(settlementError)) {
          try { terminateBackgroundExecution(context.projectContext.stateRootDir, job.id, context.ownerSessionId); }
          catch { /* expired lease recovery will settle an unconfirmed controller */ }
        }
      }
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
  let pendingChars = 0;
  let lastPublishedOutput = "";

  return {
    append(chunk) {
      if (!chunk) {
        return;
      }
      buffer = truncateHead(`${buffer}${chunk}`, BACKGROUND_OUTPUT_PREVIEW_CHARS);
      pendingChars += chunk.length;
      if (pendingChars >= BACKGROUND_OUTPUT_UPDATE_CHARS) {
        pendingChars = 0;
        lastPublishedOutput = buffer;
        onOutput(buffer);
      }
    },
    flush() {
      if (buffer.length > 0 && buffer !== lastPublishedOutput) {
        pendingChars = 0;
        lastPublishedOutput = buffer;
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

function isStaleControllerError(error: unknown): boolean {
  return error instanceof Error && /stale (?:output|controller)|previous controller/i.test(error.message);
}
