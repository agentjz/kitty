import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  acquireProjectCapabilityRuntime,
  closeProjectCapabilityRuntime,
  replaceProjectCapabilityRuntime,
} from "../../src/capabilities/runtimePool.js";
import { PLAYWRIGHT_CAPABILITY } from "../../src/capabilities/definitions.js";
import {
  PlaywrightMcpRuntime,
  resolveOfficialPlaywrightMcpPackageJson,
} from "../../src/capabilities/playwrightMcp.js";
import { CapabilityManager } from "../../src/capabilities/manager.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import type { ProcessIdentity } from "../../src/execution/process.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("Playwright MCP resolves its installed package from the executable entry", () => {
  const packageJsonPath = resolveOfficialPlaywrightMcpPackageJson();
  assert.equal(fs.existsSync(packageJsonPath), true);
  assert.match(packageJsonPath.replaceAll("\\", "/"), /\/node_modules\/@playwright\/mcp\/package\.json$/u);
});

test("Playwright MCP is reused across turn registries and closes only with the project runtime", async (t) => {
  const root = await createTempWorkspace("playwright-runtime", t);
  const config = createTestRuntimeConfig(root);
  const pid = 424_242;
  const identity: ProcessIdentity = { pid, platform: process.platform, creationMarker: "fake-playwright" };
  let connects = 0;
  let closes = 0;
  let terminations = 0;
  const ledger = new ControlPlaneLedger(root);
  ledger.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  ledger.close();

  const dependencies = {
    playwright: {
      inspectProcessIdentity: (candidate: number) => candidate === pid ? identity : {
        pid: candidate,
        platform: process.platform,
        creationMarker: `host-${candidate}`,
      },
      isProcessAlive: () => true,
      terminatePid: (candidate: number) => {
        assert.equal(candidate, pid);
        terminations += 1;
      },
      watchParent: () => () => undefined,
      connect: async () => {
        connects += 1;
        return {
          pid,
          listTools: async () => [{
            name: "browser_navigate",
            description: "Navigate",
            inputSchema: { type: "object" as const, properties: { url: { type: "string" } } },
          }],
          callTool: async () => ({ content: [{ type: "text", text: "ok" }] }),
          close: async () => { closes += 1; },
        };
      },
    },
  };

  const first = await acquireProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config, dependencies });
  assert.equal(first.toolNames.includes("playwright_browser_navigate"), true);
  const firstState = first.manager.snapshot().find((item) => item.id === "playwright")!;
  assert.equal(firstState.status, "ready");
  assert.equal(firstState.ownerGeneration, 1);
  first.release();

  const second = await acquireProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config, dependencies });
  assert.equal(connects, 1);
  assert.equal(second.manager.snapshot().find((item) => item.id === "playwright")?.ownerGeneration, 1);
  second.release();
  assert.equal(closes, 0);
  assert.equal(terminations, 0);

  await closeProjectCapabilityRuntime(root);
  assert.equal(closes, 1);
  assert.equal(terminations, 1);
  const closed = new ControlPlaneLedger(root);
  assert.equal(closed.capabilities.load("playwright")?.status, "stopped");
  assert.equal(closed.capabilities.load("playwright")?.ownerToken, undefined);
  closed.close();
});

test("capability enable operations are idempotent and do not discard an active owner", async (t) => {
  const root = await createTempWorkspace("capability-idempotent", t);
  const ledger = new ControlPlaneLedger(root);
  const enabled = ledger.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  const claimed = ledger.capabilities.claimRuntime({
    definition: PLAYWRIGHT_CAPABILITY,
    processId: process.pid,
    processIdentity: { pid: process.pid, marker: "owner" },
  });
  const repeated = ledger.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  assert.equal(repeated.operationId, claimed.operationId);
  assert.equal(repeated.ownerToken, claimed.ownerToken);
  assert.equal(repeated.ownerGeneration, 1);
  const disabled = ledger.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, false);
  const disabledAgain = ledger.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, false);
  assert.equal(disabledAgain.operationId, disabled.operationId);
  assert.equal(disabledAgain.status, "stopped");
  assert.notEqual(enabled.operationId, disabled.operationId);
  ledger.close();
});

test("an expired Playwright owner is cleaned before a replacement generation starts", async (t) => {
  const root = await createTempWorkspace("playwright-expired-owner", t);
  const config = createTestRuntimeConfig(root);
  const oldPid = 410_001;
  const newPid = 410_002;
  const oldIdentity: ProcessIdentity = { pid: oldPid, platform: process.platform, creationMarker: "old" };
  const newIdentity: ProcessIdentity = { pid: newPid, platform: process.platform, creationMarker: "new" };
  const hostIdentity: ProcessIdentity = { pid: process.pid, platform: process.platform, creationMarker: "host" };
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  const stale = seed.capabilities.claimRuntime({ definition: PLAYWRIGHT_CAPABILITY, processId: 999_001 });
  seed.capabilities.attachChild({
    id: PLAYWRIGHT_CAPABILITY.id,
    ownerToken: stale.ownerToken!,
    ownerGeneration: stale.ownerGeneration,
    childPid: oldPid,
    childIdentity: oldIdentity,
  });
  seed.close();
  expireCapabilityLease(root, PLAYWRIGHT_CAPABILITY.id);
  const terminated: number[] = [];
  const runtime = new PlaywrightMcpRuntime(root, root, config, {
    inspectProcessIdentity: (pid) => pid === oldPid ? oldIdentity : pid === newPid ? newIdentity : hostIdentity,
    isProcessAlive: () => true,
    terminatePid: (pid) => { terminated.push(pid); },
    watchParent: () => () => undefined,
    connect: async () => ({
      pid: newPid,
      listTools: async () => [],
      callTool: async () => ({}),
      close: async () => undefined,
    }),
  });
  await runtime.start();
  assert.equal(terminated[0], oldPid);
  const ledger = new ControlPlaneLedger(root);
  assert.equal(ledger.capabilities.load("playwright")?.ownerGeneration, 2);
  ledger.close();
  await runtime.close();
  assert.deepEqual(terminated, [oldPid, newPid]);
});

test("Playwright recovery refuses a second owner when a live child identity is missing", async (t) => {
  const root = await createTempWorkspace("playwright-unsafe-owner", t);
  const config = createTestRuntimeConfig(root);
  const childPid = 420_001;
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  const stale = seed.capabilities.claimRuntime({ definition: PLAYWRIGHT_CAPABILITY, processId: 999_002 });
  seed.capabilities.attachChild({
    id: PLAYWRIGHT_CAPABILITY.id,
    ownerToken: stale.ownerToken!,
    ownerGeneration: stale.ownerGeneration,
    childPid,
  });
  seed.close();
  expireCapabilityLease(root, PLAYWRIGHT_CAPABILITY.id);
  let connects = 0;
  const manager = new CapabilityManager(root, root, config, {
    playwright: {
      inspectProcessIdentity: () => undefined,
      isProcessAlive: () => true,
      terminatePid: () => assert.fail("an unverified pid must not be terminated"),
      connect: async () => {
        connects += 1;
        throw new Error("must not connect");
      },
    },
  });
  await assert.rejects(() => manager.setEnabled("playwright", false), /identity is missing/i);
  assert.equal(connects, 0);
  const ledger = new ControlPlaneLedger(root);
  assert.equal(ledger.capabilities.load("playwright")?.enabled, true);
  assert.equal(ledger.capabilities.load("playwright")?.ownerGeneration, 1);
  ledger.close();
});

test("project runtime replacement waits for old Playwright cleanup before creating the next owner", async (t) => {
  const root = await createTempWorkspace("playwright-runtime-replace", t);
  const config = createTestRuntimeConfig(root);
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  seed.close();
  let connects = 0;
  let closes = 0;
  let releaseFirstClose!: () => void;
  let firstCloseStarted!: () => void;
  const closeStarted = new Promise<void>((resolve) => { firstCloseStarted = resolve; });
  const firstCloseGate = new Promise<void>((resolve) => { releaseFirstClose = resolve; });
  const dependencies = {
    playwright: {
      connect: async () => {
        const connection = ++connects;
        return {
          pid: null,
          listTools: async () => [],
          callTool: async () => ({}),
          close: async () => {
            closes += 1;
            if (connection === 1) {
              firstCloseStarted();
              await firstCloseGate;
            }
          },
        };
      },
    },
  };

  const initial = await acquireProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config, dependencies });
  initial.release();
  const replacement = replaceProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config, dependencies });
  await closeStarted;
  const concurrentAcquire = acquireProjectCapabilityRuntime({ cwd: root, stateRootDir: root, config, dependencies });
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.equal(connects, 1);
  releaseFirstClose();
  await replacement;
  const next = await concurrentAcquire;
  next.release();
  assert.equal(connects, 2);
  assert.equal(closes, 1);
  await closeProjectCapabilityRuntime(root);
  assert.equal(closes, 2);
});

test("concurrent Playwright closes share one cleanup transaction", async (t) => {
  const root = await createTempWorkspace("playwright-concurrent-close", t);
  const config = createTestRuntimeConfig(root);
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  seed.close();
  let closes = 0;
  const runtime = new PlaywrightMcpRuntime(root, root, config, {
    connect: async () => ({
      pid: null,
      listTools: async () => [],
      callTool: async () => ({}),
      close: async () => { closes += 1; },
    }),
  });
  await runtime.start();
  await Promise.all([runtime.close(), runtime.close(), runtime.close()]);
  assert.equal(closes, 1);
});

test("incomplete Playwright cleanup retains the degraded owner until a later idempotent cleanup succeeds", async (t) => {
  const root = await createTempWorkspace("playwright-cleanup-recovery", t);
  const config = createTestRuntimeConfig(root);
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  seed.close();
  let failClose = true;
  const runtime = new PlaywrightMcpRuntime(root, root, config, {
    connect: async () => ({
      pid: null,
      listTools: async () => [],
      callTool: async () => ({}),
      close: async () => {
        if (failClose) {
          failClose = false;
          throw new Error("fake connection cleanup failed");
        }
      },
    }),
  });
  await runtime.start();
  await assert.rejects(() => runtime.close(), /cleanup was incomplete/u);
  const degraded = new ControlPlaneLedger(root);
  assert.equal(degraded.capabilities.load("playwright")?.status, "degraded");
  assert.equal(Boolean(degraded.capabilities.load("playwright")?.ownerToken), true);
  degraded.close();

  await runtime.close();
  const stopped = new ControlPlaneLedger(root);
  assert.equal(stopped.capabilities.load("playwright")?.status, "stopped");
  assert.equal(stopped.capabilities.load("playwright")?.ownerToken, undefined);
  stopped.close();
});

test("Playwright startup cleanup keeps ownership until connection and child cleanup both succeed", async (t) => {
  const root = await createTempWorkspace("playwright-startup-cleanup", t);
  const config = createTestRuntimeConfig(root);
  const childPid = 430_001;
  const childIdentity: ProcessIdentity = { pid: childPid, platform: process.platform, creationMarker: "startup-child" };
  const ownerIdentity: ProcessIdentity = { pid: process.pid, platform: process.platform, creationMarker: "startup-owner" };
  const seed = new ControlPlaneLedger(root);
  seed.capabilities.setEnabled(PLAYWRIGHT_CAPABILITY, true);
  seed.close();
  let connectionCloseFails = true;
  let childCleanupFails = true;
  const runtime = new PlaywrightMcpRuntime(root, root, config, {
    inspectProcessIdentity: (pid) => pid === childPid ? childIdentity : ownerIdentity,
    isProcessAlive: () => true,
    terminatePid: () => {
      if (childCleanupFails) throw new Error("fake child cleanup failed");
    },
    watchParent: () => () => undefined,
    connect: async () => ({
      pid: childPid,
      listTools: async () => { throw new Error("fake tool catalog failed"); },
      callTool: async () => ({}),
      close: async () => {
        if (connectionCloseFails) throw new Error("fake connection cleanup failed");
      },
    }),
  });

  await assert.rejects(() => runtime.start(), /fake tool catalog failed/u);
  const retained = new ControlPlaneLedger(root);
  const degraded = retained.capabilities.load("playwright");
  assert.equal(degraded?.status, "degraded");
  assert.equal(Boolean(degraded?.ownerToken), true);
  assert.equal(degraded?.childPid, childPid);
  retained.close();

  connectionCloseFails = false;
  childCleanupFails = false;
  await runtime.close();
  const released = new ControlPlaneLedger(root);
  assert.equal(released.capabilities.load("playwright")?.ownerToken, undefined);
  assert.equal(released.capabilities.load("playwright")?.status, "stopped");
  released.close();
});

function expireCapabilityLease(root: string, capabilityId: string): void {
  const db = new DatabaseSync(getProjectStatePaths(root).controlPlaneLedgerFile);
  try {
    db.prepare("UPDATE capability_states SET lease_expires_at=? WHERE capability_id=?")
      .run("2000-01-01T00:00:00.000Z", capabilityId);
  } finally {
    db.close();
  }
}
