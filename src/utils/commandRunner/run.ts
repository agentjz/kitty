import { isAbortError } from "../abort.js";
import { createBashOutputCapture } from "../../tools/outputCapture.js";
import { launchCommand } from "./launch.js";
import { normalizeCommandOutput } from "./output.js";
import { inspectProcessIdentity, isProcessAlive, terminatePid } from "../../execution/process.js";
import {
  ForegroundExecutionController,
  type ForegroundExecutionInput,
} from "../../execution/foreground.js";

export interface CommandRunOptions {
  command: string;
  cwd: string;
  timeoutMs: number;
  stallTimeoutMs: number;
  abortSignal?: AbortSignal;
  outputCapture?: {
    stateRootDir?: string;
    sessionId?: string;
    maxPreviewChars?: number;
  };
  execution?: Omit<ForegroundExecutionInput, "command" | "cwd" | "timeoutMs">;
}

export interface CommandRunResult {
  command: string;
  exitCode: number | null;
  output: string;
  outputPath?: string;
  truncated: boolean;
  outputChars: number;
  outputBytes: number;
  timedOut: boolean;
  aborted: boolean;
  stalled: boolean;
  attempts: number;
  durationMs: number;
}

const STALL_KILL_TIMEOUT_MS = 5_000;

export async function runCommandWithPolicy(options: CommandRunOptions): Promise<CommandRunResult> {
  return runCommandOnce(options);
}

async function runCommandOnce(options: CommandRunOptions): Promise<CommandRunResult> {
  const start = Date.now();
  let stalled = false;
  let stallTimer: NodeJS.Timeout | null = null;
  let forceKillTimer: NodeJS.Timeout | null = null;

  const execution = options.execution
    ? new ForegroundExecutionController({
        ...options.execution,
        command: options.command,
        cwd: options.cwd,
        timeoutMs: options.timeoutMs,
      })
    : undefined;

  const outputCapture = await createBashOutputCapture(options.outputCapture ?? {}).catch((error) => {
    execution?.failBeforeStart(error);
    throw error;
  });
  const launched = await launchCommand(options.command, options.cwd, options.timeoutMs, options.abortSignal).catch((error) => {
    execution?.failBeforeStart(error);
    throw error;
  });
  const { subprocess } = launched;
  if (subprocess.all) {
    subprocess.all.on("data", (chunk) => {
      outputCapture.append(Buffer.isBuffer(chunk) ? chunk.toString("utf8") : String(chunk));
    });
  }
  const pid = subprocess.pid;
  const identity = launched.processIdentity ?? (typeof pid === "number" ? inspectProcessIdentity(pid) : undefined);
  if (typeof pid === "number" && execution && !identity && isProcessAlive(pid)) {
    const error = new Error(`Foreground process ${pid} could not be registered with a creation identity.`);
    try {
      terminatePid(pid);
      execution.failBeforeStart(error);
      throw error;
    } catch (terminationError) {
      const failure = terminationError === error
        ? error
        : new AggregateError([error, terminationError], `Foreground process ${pid} registration and cleanup failed.`);
      execution.failBeforeStart(failure);
      throw failure;
    } finally {
      await outputCapture.finalize().catch(() => undefined);
      launched.stopParentDeathWatchdog();
    }
  }
  if (typeof pid === "number" && identity) {
    try {
      execution?.start(pid, identity);
    } catch (error) {
      try { terminatePid(pid, identity); } catch { /* launch failure remains authoritative */ }
      execution?.failBeforeStart(error);
      throw error;
    }
  }
  const stopWatchdog = launched.stopParentDeathWatchdog;
  const terminateTree = () => {
    if (typeof pid !== "number") return;
    try { terminatePid(pid, identity); } catch { /* process settlement exposes failure */ }
  };
  const onAbort = () => terminateTree();
  options.abortSignal?.addEventListener("abort", onAbort, { once: true });

  const clearTimers = () => {
    if (stallTimer) {
      clearTimeout(stallTimer);
      stallTimer = null;
    }
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
      forceKillTimer = null;
    }
  };

  const resetStallTimer = () => {
    if (stalled) {
      return;
    }

    if (stallTimer) {
      clearTimeout(stallTimer);
    }

    if (options.stallTimeoutMs > 0) {
      stallTimer = setTimeout(() => {
        stalled = true;
        try {
          terminateTree();
        } catch {
          // ignore
        }
        if (STALL_KILL_TIMEOUT_MS > 0) {
          if (forceKillTimer) {
            clearTimeout(forceKillTimer);
          }
          forceKillTimer = setTimeout(() => {
            try {
              if (typeof subprocess.exitCode !== "number") {
                terminateTree();
              }
            } catch {
              // ignore
            }
          }, STALL_KILL_TIMEOUT_MS);
        }
      }, options.stallTimeoutMs);
    }
  };

  resetStallTimer();

  if (subprocess.all) {
    subprocess.all.on("data", () => {
      resetStallTimer();
    });
  }

  try {
    const result = await subprocess;
    clearTimers();
    const shellOutput = await outputCapture.finalize();
    const output = normalizeCommandOutput(shellOutput.outputPreview);

    const commandResult: CommandRunResult = {
      command: options.command,
      exitCode: typeof result.exitCode === "number" ? result.exitCode : null,
      output,
      outputPath: shellOutput.outputPath,
      truncated: shellOutput.truncated,
      outputChars: shellOutput.outputChars,
      outputBytes: shellOutput.outputBytes,
      timedOut: Boolean((result as { timedOut?: unknown }).timedOut),
      aborted: !Boolean((result as { timedOut?: unknown }).timedOut) && isAbortedProcessResult(result, options.abortSignal),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
    execution?.settle(commandResult);
    return commandResult;
  } catch (error) {
    const timedOut = isTimedOutError(error);
    clearTimers();
    const shellOutput = await outputCapture.finalize();
    const fallbackOutput = shellOutput.outputChars > 0 ? shellOutput.outputPreview : readProcessOutput(error);
    const output = normalizeCommandOutput(fallbackOutput);

    const commandResult: CommandRunResult = {
      command: options.command,
      exitCode: readExitCode(error),
      output,
      outputPath: shellOutput.outputPath,
      truncated: shellOutput.truncated,
      outputChars: shellOutput.outputChars,
      outputBytes: shellOutput.outputBytes,
      timedOut,
      aborted: !timedOut && isAbortedProcessResult(error, options.abortSignal),
      stalled,
      attempts: 1,
      durationMs: Date.now() - start,
    };
    execution?.settle(commandResult);
    return commandResult;
  } finally {
    clearTimers();
    execution?.settleUnexpectedExit();
    execution?.dispose();
    stopWatchdog();
    options.abortSignal?.removeEventListener("abort", onAbort);
  }
}

function isTimedOutError(error: unknown): boolean {
  return Boolean((error as { timedOut?: unknown }).timedOut);
}

function readExitCode(error: unknown): number | null {
  const exitCode = (error as { exitCode?: unknown }).exitCode;
  return typeof exitCode === "number" && Number.isFinite(exitCode) ? Math.trunc(exitCode) : null;
}

function readProcessOutput(error: unknown): string {
  const all = (error as { all?: unknown }).all;
  if (typeof all === "string" && all.length > 0) {
    return all;
  }

  const message = (error as { message?: unknown }).message;
  return typeof message === "string" && message.length > 0 ? message : "Command failed.";
}

function isAbortedProcessResult(value: unknown, signal: AbortSignal | undefined): boolean {
  if ((value as { isCanceled?: unknown }).isCanceled === true) {
    return true;
  }

  return Boolean(signal?.aborted) || isAbortError(value);
}
