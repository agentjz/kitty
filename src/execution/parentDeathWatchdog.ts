import { spawn } from "node:child_process";

import { inspectProcessIdentity, type ProcessIdentity } from "./process.js";

const WATCHDOG_SCRIPT = String.raw`
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const parentPid = Number(process.argv[1]);
const targetPid = Number(process.argv[2]);
const expectedParentMarker = process.argv[3] || "";
const expectedTargetMarker = process.argv[4] || "";
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const marker = (pid) => {
  try {
    if (process.platform === "linux") {
      const stat = fs.readFileSync('/proc/' + pid + '/stat', 'utf8');
      const close = stat.lastIndexOf(')');
      return stat.slice(close + 2).split(' ')[19] || '';
    }
    if (process.platform === "win32") {
      const script = '(Get-CimInstance Win32_Process -Filter "ProcessId=' + pid + '").CreationDate.ToUniversalTime().ToString("o")';
      return spawnSync("powershell.exe", ["-NoLogo", "-NoProfile", "-Command", script], {
        encoding: "utf8", windowsHide: true, stdio: ["ignore", "pipe", "ignore"]
      }).stdout.trim();
    }
    return spawnSync("ps", ["-o", "lstart=", "-p", String(pid)], {
      encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]
    }).stdout.trim();
  } catch {}
  return '';
};
const timer = setInterval(() => {
  if (!alive(targetPid)) {
    clearInterval(timer);
    process.exit(0);
  }
  if (alive(parentPid) && (!expectedParentMarker || marker(parentPid) === expectedParentMarker)) return;
  if (expectedTargetMarker && marker(targetPid) !== expectedTargetMarker) {
    clearInterval(timer);
    process.exit(0);
  }
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(targetPid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try { process.kill(-targetPid, "SIGKILL"); } catch {}
    try { process.kill(targetPid, "SIGKILL"); } catch {}
  }
  clearInterval(timer);
  process.exit(0);
}, 100);
`;

export function watchProcessUntilParentExit(input: {
  parentPid: number;
  targetPid: number;
  parentIdentity?: ProcessIdentity;
  targetIdentity?: ProcessIdentity;
}): () => void {
  const parentIdentity = input.parentIdentity ?? inspectCachedIdentity(input.parentPid);
  const targetIdentity = input.targetIdentity ?? inspectProcessIdentity(input.targetPid);
  const watchdog = spawn(process.execPath, [
    "-e",
    WATCHDOG_SCRIPT,
    String(input.parentPid),
    String(input.targetPid),
    parentIdentity?.creationMarker ?? "",
    targetIdentity?.creationMarker ?? "",
  ], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  watchdog.unref();
  return () => {
    try { watchdog.kill("SIGTERM"); } catch { /* watchdog may already be gone */ }
  };
}

const identityCache = new Map<number, ProcessIdentity>();

function inspectCachedIdentity(pid: number): ProcessIdentity | undefined {
  const cached = identityCache.get(pid);
  if (cached) return cached;
  const identity = inspectProcessIdentity(pid);
  if (identity) identityCache.set(pid, identity);
  return identity;
}
