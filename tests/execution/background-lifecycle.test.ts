import assert from "node:assert/strict";
import test from "node:test";

import {
  BackgroundExecutionStore,
  reconcileBackgroundExecutions,
  waitForBackgroundExecution,
} from "../../src/execution/background.js";
import { isAbortError } from "../../src/utils/abort.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

test("background execution store creates, starts, closes, and emits wake facts", async (t) => {
  const root = await createTempWorkspace("background-store", t);
  const store = new BackgroundExecutionStore(root);

  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "node -e \"process.exit(0)\"",
    cwd: root,
    requestedBy: "agent",
    timeoutMs: 10_000,
  });

  store.markRunning(job.id, { pid: 4321 });
  const closed = store.close(job.id, {
    status: "completed",
    exitCode: 0,
    output: "ok",
    summary: "background completed",
  });

  const wakeSignals = store.listWakeSignals();

  assert.equal(closed.status, "completed");
  assert.equal(closed.pid, 4321);
  assert.equal(closed.output, "ok");
  assert.equal(wakeSignals.length, 1);
  assert.equal(wakeSignals[0]?.executionId, job.id);
  assert.equal(wakeSignals[0]?.reason, "completed");
});

test("background reconcile marks dead running pid as stale", async (t) => {
  const root = await createTempWorkspace("background-reconcile", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "lost process",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, { pid: 999_999_999 });

  const result = reconcileBackgroundExecutions(root);
  const reloaded = store.load(job.id);

  assert.equal(result.lostExecutions.length, 1);
  assert.equal(reloaded?.status, "lost");
  assert.match(String(reloaded?.summary), /disappeared/i);
});

test("background execution store records running output summaries", async (t) => {
  const root = await createTempWorkspace("background-running-output", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "long command",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, { pid: process.pid });

  store.updateRunningOutput(job.id, {
    output: "step one\nstep two\n",
    summary: "step two",
    lastOutputAt: "2026-05-22T00:00:00.000Z",
  });
  const running = store.load(job.id);

  assert.equal(running?.status, "running");
  assert.equal(running?.summary, "step two");
  assert.equal(running?.lastOutputAt, "2026-05-22T00:00:00.000Z");
  assert.match(running?.output ?? "", /step one/);
});

test("background wait stops immediately when its caller aborts", async (t) => {
  const root = await createTempWorkspace("background-wait-abort", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "long command",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, { pid: process.pid });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => waitForBackgroundExecution({ rootDir: root, id: job.id, abortSignal: controller.signal }),
    isAbortError,
  );
  assert.equal(store.load(job.id)?.status, "running");
});
