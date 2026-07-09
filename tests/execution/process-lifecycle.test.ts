import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import test from "node:test";

import { isProcessAlive, terminatePid } from "../../src/execution/process.js";

test("terminatePid kills a Windows process tree", { skip: process.platform !== "win32" }, async (t) => {
  const { parent, childPidPath } = await spawnProcessTree("windows");

  t.after(() => {
    if (parent.pid && isProcessAlive(parent.pid)) {
      terminatePid(parent.pid);
    }
  });

  assert.ok(parent.pid);
  const childPid = await waitForChildPid(childPidPath);
  assert.equal(isProcessAlive(childPid), true);

  terminatePid(parent.pid);

  await waitForProcessExit(parent.pid);
  await waitForProcessExit(childPid);
  assert.equal(isProcessAlive(childPid), false);
});

test("terminatePid kills a POSIX process tree", { skip: process.platform === "win32" }, async (t) => {
  const { parent, childPidPath } = await spawnProcessTree("posix");

  t.after(() => {
    if (parent.pid && isProcessAlive(parent.pid)) {
      terminatePid(parent.pid);
    }
  });

  assert.ok(parent.pid);
  const childPid = await waitForChildPid(childPidPath);
  assert.equal(isProcessAlive(childPid), true);

  terminatePid(parent.pid);

  await waitForProcessExit(parent.pid);
  await waitForProcessExit(childPid);
  assert.equal(isProcessAlive(childPid), false);
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
