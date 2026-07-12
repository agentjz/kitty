import { spawn } from "node:child_process";

const WATCHDOG_SCRIPT = String.raw`
const { spawnSync } = require("node:child_process");
const parentPid = Number(process.argv[1]);
const targetPid = Number(process.argv[2]);
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const timer = setInterval(() => {
  if (!alive(targetPid)) {
    clearInterval(timer);
    process.exit(0);
  }
  if (alive(parentPid)) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(targetPid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
  } else {
    try { process.kill(targetPid, "SIGKILL"); } catch {}
  }
  clearInterval(timer);
  process.exit(0);
}, 250);
`;

export function watchProcessUntilParentExit(input: {
  parentPid: number;
  targetPid: number;
}): () => void {
  const watchdog = spawn(process.execPath, ["-e", WATCHDOG_SCRIPT, String(input.parentPid), String(input.targetPid)], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  watchdog.unref();
  return () => {
    try {
      watchdog.kill("SIGTERM");
    } catch {
      // The watchdog may already have observed parent exit.
    }
  };
}
