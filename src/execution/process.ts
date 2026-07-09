import process from "node:process";
import { execFileSync } from "node:child_process";

const POSIX_KILL_ESCALATION_DELAY_MS = 200;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function terminatePid(pid: number): void {
  if (pid === process.pid) {
    return;
  }
  if (!Number.isInteger(pid) || pid <= 0) {
    return;
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
    if (!isProcessAlive(pid)) {
      return;
    }
    throw error;
  }
}

function terminatePosixProcessTree(pid: number): void {
  const descendants = listPosixDescendantPids(pid);
  const targets = uniquePids([...descendants].reverse().concat(pid));

  sendPosixProcessGroupSignal(pid, "SIGTERM");
  sendPosixSignals(targets, "SIGTERM");
  sleepSync(POSIX_KILL_ESCALATION_DELAY_MS);

  if (!targets.some(isProcessAlive)) {
    return;
  }

  sendPosixProcessGroupSignal(pid, "SIGKILL");
  sendPosixSignals(targets, "SIGKILL");

  if (isProcessAlive(pid)) {
    throw new Error(`Failed to terminate process tree rooted at pid ${pid}.`);
  }
}

function listPosixDescendantPids(pid: number): number[] {
  const descendants: number[] = [];
  const queue = [pid];
  const visited = new Set<number>([pid]);

  for (let index = 0; index < queue.length; index += 1) {
    for (const childPid of listPosixChildPids(queue[index] as number)) {
      if (visited.has(childPid)) {
        continue;
      }
      visited.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }

  return descendants;
}

function listPosixChildPids(pid: number): number[] {
  try {
    const output = execFileSync("pgrep", ["-P", String(pid)], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
    return output
      .split(/\r?\n/)
      .map((value) => Number.parseInt(value.trim(), 10))
      .filter((value) => Number.isInteger(value) && value > 0);
  } catch {
    return [];
  }
}

function sendPosixProcessGroupSignal(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(-pid, signal);
  } catch {
    // Not every child is a process-group leader. Individual pid kills below are the fallback.
  }
}

function sendPosixSignals(pids: readonly number[], signal: NodeJS.Signals): void {
  for (const pid of pids) {
    try {
      process.kill(pid, signal);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ESRCH") {
        throw error;
      }
    }
  }
}

function uniquePids(pids: readonly number[]): number[] {
  return [...new Set(pids.filter((pid) => pid !== process.pid))];
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
