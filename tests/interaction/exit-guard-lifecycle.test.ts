import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundExecutionStore } from "../../src/execution/background.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { collectRunningProcesses, terminateProcesses } from "../../src/interaction/exitGuard.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

test("exit guard collects running background executions from the control plane", async (t) => {
  const root = await createTempWorkspace("exit-guard-collect", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "long task",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, { pid: process.pid });

  const running = await collectRunningProcesses(root, TEST_EXECUTION_OWNER.ownerSessionId);

  assert.equal(running.length, 1);
  assert.equal(running[0]?.kind, "background");
  assert.equal(running[0]?.id, job.id);
  assert.equal(running[0]?.pid, process.pid);
});
test("exit guard termination closes background executions even when pid is already gone", async (t) => {
  const root = await createTempWorkspace("exit-guard-terminate", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "gone task",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, { pid: 999_999_999 });

  const result = await terminateProcesses([{ kind: "background", id: job.id, pid: 999_999_999, summary: "gone" }], root);
  const reloaded = store.load(job.id);

  assert.deepEqual(result.failedPids, []);
  assert.deepEqual(result.terminatedPids, [999_999_999]);
  assert.equal(reloaded?.status, "aborted");
});
