import { loadExeca } from "../execa.js";
import type { ResultPromise } from "execa";
import { getShellRuntimeInfo } from "./shellRuntime.js";
import { inspectProcessIdentity, type ProcessIdentity } from "../../execution/process.js";
import { watchProcessUntilParentExit } from "../../execution/parentDeathWatchdog.js";

type LaunchedCommand = ResultPromise<{
  cwd: string;
  timeout: number;
  cancelSignal: AbortSignal | undefined;
  all: true;
  buffer: false;
  reject: false;
  env: NodeJS.ProcessEnv;
  detached: boolean;
}>;

export interface LaunchedCommandHandle {
  subprocess: LaunchedCommand;
  processIdentity?: ProcessIdentity;
  stopParentDeathWatchdog: () => void;
}

export async function launchCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
  abortSignal?: AbortSignal,
): Promise<LaunchedCommandHandle> {
  const execa = await loadExeca();
  const shell = getShellRuntimeInfo();
  const subprocess = shell.shell === "powershell"
    ? execa(shell.executable, ["-NoLogo", "-NoProfile", "-EncodedCommand", encodePowerShellCommand(command)], {
        cwd,
        timeout: timeoutMs,
        cancelSignal: abortSignal,
        all: true,
        buffer: false,
        reject: false,
        env: buildCommandEnvironment(),
        detached: process.platform !== "win32",
      })
    : execa(shell.executable, ["-lc", command], {
        cwd,
        timeout: timeoutMs,
        cancelSignal: abortSignal,
        all: true,
        buffer: false,
        reject: false,
        env: buildCommandEnvironment(),
        detached: process.platform !== "win32",
      });
  const pid = subprocess.pid;
  const processIdentity = typeof pid === "number" ? inspectProcessIdentity(pid) : undefined;
  const stopParentDeathWatchdog = typeof pid === "number"
    ? watchProcessUntilParentExit({ parentPid: process.pid, targetPid: pid, targetIdentity: processIdentity })
    : () => undefined;
  return { subprocess: subprocess as LaunchedCommand, processIdentity, stopParentDeathWatchdog };
}

function encodePowerShellCommand(command: string): string {
  const wrapped = [
    "$ProgressPreference = 'SilentlyContinue'",
    "$ErrorActionPreference = 'Stop'",
    "[Console]::InputEncoding = [System.Text.Encoding]::UTF8",
    "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8",
    "$OutputEncoding = [System.Text.Encoding]::UTF8",
    "try { chcp 65001 > $null } catch { }",
    "$code = 0",
    "try {",
    `& { ${command} }`,
    "$code = if ($null -ne $LASTEXITCODE) { [int]$LASTEXITCODE } elseif ($?) { 0 } else { 1 }",
    "} catch {",
    "[Console]::Error.WriteLine($_.Exception.Message)",
    "$code = 1",
    "}",
    "exit $code",
  ].join("\n");
  return Buffer.from(wrapped, "utf16le").toString("base64");
}

function buildCommandEnvironment(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    LANG: process.env.LANG || "C.UTF-8",
    LC_ALL: process.env.LC_ALL || "C.UTF-8",
    PYTHONIOENCODING: process.env.PYTHONIOENCODING || "utf-8",
  };
}
