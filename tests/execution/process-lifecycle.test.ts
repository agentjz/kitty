import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import test from "node:test";

import { inspectProcessIdentity, isProcessAlive, terminatePid } from "../../src/execution/process.js";
import { watchProcessUntilParentExit } from "../../src/execution/parentDeathWatchdog.js";

test("parent death watchdog kills a background process after abrupt host loss", async (t) => {
  const parent = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  const target = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  assert.ok(parent.pid);
  assert.ok(target.pid);
  const stopWatchdog = watchProcessUntilParentExit({ parentPid: parent.pid, targetPid: target.pid });
  t.after(() => {
    stopWatchdog();
    forceKillTestProcess(parent.pid);
    forceKillTestProcess(target.pid);
  });

  process.kill(parent.pid, "SIGKILL");
  await waitForProcessExit(parent.pid);
  await waitForProcessExit(target.pid);
  assert.equal(isProcessAlive(target.pid), false);
});

test("terminatePid kills a Windows process tree", { skip: process.platform !== "win32" }, async (t) => {
  const { parent, childPidPath } = await spawnProcessTree("windows");
  let childPid: number | undefined;

  t.after(() => {
    forceKillTestProcess(childPid);
    forceKillTestProcess(parent.pid);
  });

  assert.ok(parent.pid);
  childPid = await waitForChildPid(childPidPath);
  assert.equal(isProcessAlive(childPid), true);

  terminatePid(parent.pid);

  await waitForProcessExit(parent.pid);
  await waitForProcessExit(childPid);
  assert.equal(isProcessAlive(childPid), false);
});

test("terminatePid kills a POSIX process tree", { skip: process.platform === "win32" }, async (t) => {
  const { parent, childPidPath } = await spawnProcessTree("posix");
  let childPid: number | undefined;

  t.after(() => {
    forceKillTestProcess(childPid);
    forceKillTestProcess(parent.pid);
  });

  assert.ok(parent.pid);
  childPid = await waitForChildPid(childPidPath);
  assert.equal(isProcessAlive(childPid), true);

  terminatePid(parent.pid);

  await waitForProcessExit(parent.pid);
  await waitForProcessExit(childPid);
  assert.equal(isProcessAlive(childPid), false);
});

test("terminatePid refuses a reused process identity", async (t) => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  assert.ok(child.pid);
  t.after(() => forceKillTestProcess(child.pid));
  const identity = inspectProcessIdentity(child.pid);
  assert.ok(identity);
  assert.throws(() => terminatePid(child.pid!, { ...identity, creationMarker: `${identity.creationMarker}-reused` }), /identity changed/i);
  assert.equal(isProcessAlive(child.pid), true);
  terminatePid(child.pid, identity);
  await waitForProcessExit(child.pid);
});

test("terminatePid treats an already exited expected process as settled", async (t) => {
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true });
  assert.ok(child.pid);
  t.after(() => forceKillTestProcess(child.pid));
  const identity = inspectProcessIdentity(child.pid);
  assert.ok(identity);

  const exited = new Promise<void>((resolve, reject) => {
    child.once("exit", () => resolve());
    child.once("error", reject);
  });
  process.kill(child.pid, "SIGKILL");
  await exited;

  assert.equal(isProcessAlive(child.pid), false);
  assert.doesNotThrow(() => terminatePid(child.pid!, identity));
});

async function spawnProcessTree(platform: "windows" | "posix"): Promise<{
  parent: ReturnType<typeof spawn>;
  childPidPath: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kitty-process-tree-"));
  const childPidPath = path.join(root, "child.pid");
  const parent = spawn(process.execPath, [
    "-e",
    [
      "const { spawn } = require('node:child_process');",
      "const fs = require('node:fs');",
      "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });",
      "fs.writeFileSync(process.argv[1], String(child.pid));",
      "setInterval(() => {}, 1000);",
    ].join(" "),
    childPidPath,
  ], {
    stdio: "ignore",
    windowsHide: true,
    detached: platform === "posix",
  });
  return { parent, childPidPath };
}

async function waitForChildPid(filePath: string): Promise<number> {
  const deadline = Date.now() + 5000;
  for (;;) {
    try {
      const raw = await fs.readFile(filePath, "utf8");
      const pid = Number.parseInt(raw.trim(), 10);
      if (Number.isFinite(pid) && pid > 0) {
        return pid;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        throw error;
      }
    }
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for child pid file.");
    }
    await sleep(50);
  }
}

async function waitForProcessExit(pid: number): Promise<void> {
  const deadline = Date.now() + 5000;
  while (isProcessAlive(pid)) {
    if (Date.now() > deadline) {
      throw new Error(`Process ${pid} did not exit.`);
    }
    await sleep(50);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function forceKillTestProcess(pid: number | undefined): void {
  if (!pid || !isProcessAlive(pid)) return;
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process may have exited between the liveness check and cleanup.
  }
}
