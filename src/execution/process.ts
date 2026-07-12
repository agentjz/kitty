import { execFileSync } from "node:child_process";
import fs from "node:fs";
import process from "node:process";

const POSIX_KILL_ESCALATION_DELAY_MS = 200;

export interface ProcessIdentity {
  [key: string]: unknown;
  pid: number;
  platform: NodeJS.Platform;
  creationMarker: string;
}

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function inspectProcessIdentity(pid: number): ProcessIdentity | undefined {
  if (!Number.isInteger(pid) || pid <= 0 || !isProcessAlive(pid)) return undefined;
  try {
    if (process.platform === "linux") {
      const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
      const close = stat.lastIndexOf(")");
      const startTicks = stat.slice(close + 2).split(" ")[19];
      if (startTicks) return { pid, platform: process.platform, creationMarker: startTicks };
    }
    if (process.platform === "win32") {
      const script = `(Get-CimInstance Win32_Process -Filter \"ProcessId=${pid}\").CreationDate.ToUniversalTime().ToString('o')`;
      const marker = execFileSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", script], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        windowsHide: true,
      }).trim();
      if (marker) return { pid, platform: process.platform, creationMarker: marker };
    }
    const marker = execFileSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (marker) return { pid, platform: process.platform, creationMarker: marker };
  } catch {
    return undefined;
  }
  return undefined;
}

export function isSameProcess(identity: ProcessIdentity): boolean {
  const current = inspectProcessIdentity(identity.pid);
  return Boolean(current && current.platform === identity.platform && current.creationMarker === identity.creationMarker);
}

export function terminatePid(pid: number, expectedIdentity?: ProcessIdentity): void {
  if (pid === process.pid || !Number.isInteger(pid) || pid <= 0) return;
  if (expectedIdentity && !isSameProcess(expectedIdentity)) {
    throw new Error(`Refusing to terminate pid ${pid}: process identity changed.`);
  }
  if (process.platform === "win32") {
    terminateWindowsProcessTree(pid);
    return;
  }
  terminatePosixProcessTree(pid);
}

function terminateWindowsProcessTree(pid: number): void {
  try {
    execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } catch (error) {
    if (!isProcessAlive(pid)) return;
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      if (isProcessAlive(pid)) throw error;
    }
    waitForProcessExitSync(pid, 500);
    if (isProcessAlive(pid)) throw error;
  }
  waitForProcessExitSync(pid, 500);
  if (isProcessAlive(pid)) throw new Error(`Failed to terminate Windows process tree rooted at pid ${pid}.`);
}

function terminatePosixProcessTree(pid: number): void {
  const descendants = listPosixDescendantPids(pid);
  const targets = uniquePids([...descendants].reverse().concat(pid));
  sendPosixProcessGroupSignal(pid, "SIGTERM");
  sendPosixSignals(targets, "SIGTERM");
  sleepSync(POSIX_KILL_ESCALATION_DELAY_MS);
  if (!targets.some(isProcessAlive)) return;
  sendPosixProcessGroupSignal(pid, "SIGKILL");
  sendPosixSignals(targets, "SIGKILL");
  if (targets.some(isProcessAlive)) throw new Error(`Failed to terminate process tree rooted at pid ${pid}.`);
}

function listPosixDescendantPids(pid: number): number[] {
  const descendants: number[] = [];
  const queue = [pid];
  const visited = new Set<number>([pid]);
  for (let index = 0; index < queue.length; index += 1) {
    for (const childPid of listPosixChildPids(queue[index]!)) {
      if (visited.has(childPid)) continue;
      visited.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }
  return descendants;
}

function listPosixChildPids(pid: number): number[] {
  try {
    return execFileSync("pgrep", ["-P", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).split(/\r?\n/).map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function sendPosixProcessGroupSignal(pid: number, signal: NodeJS.Signals): void {
  try { process.kill(-pid, signal); } catch { /* child may not lead a process group */ }
}

function sendPosixSignals(pids: readonly number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try { process.kill(pid, signal); } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
    }
  }
}

function uniquePids(pids: readonly number[]): number[] {
  return [...new Set(pids.filter((pid) => pid !== process.pid))];
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function waitForProcessExitSync(pid: number, timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs;
  while (isProcessAlive(pid) && Date.now() < deadline) sleepSync(10);
}
