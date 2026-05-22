import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundExecutionStore, reconcileBackgroundExecutions } from "../../src/execution/background.js";
import { createTempWorkspace } from "../helpers.js";

test("background execution store creates, starts, closes, and emits wake facts", async (t) => {
  const root = await createTempWorkspace("background-store", t);
  const store = new BackgroundExecutionStore(root);

  const job = store.create({
    command: "node -e \"process.exit(0)\"",
    cwd: root,
    requestedBy: "lead",
    sessionId: "session-1",
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
    command: "lost process",
    cwd: root,
    requestedBy: "lead",
  });
  store.markRunning(job.id, { pid: 999_999_999 });

  const result = reconcileBackgroundExecutions(root);
  const reloaded = store.load(job.id);

  assert.equal(result.staleExecutions.length, 1);
  assert.equal(reloaded?.status, "stale");
  assert.match(String(reloaded?.summary), /disappeared/i);
});
