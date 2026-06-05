import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundExecutionStore } from "../../src/execution/background.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { collectRunningProcesses, terminateProcesses } from "../../src/interaction/exitGuard.js";
import { createTempWorkspace } from "../helpers.js";

test("exit guard collects running background executions from the control plane", async (t) => {
  const root = await createTempWorkspace("exit-guard-collect", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    command: "long task",
    cwd: root,
    requestedBy: "lead",
  });
  store.markRunning(job.id, { pid: process.pid });

  const running = await collectRunningProcesses(root);

  assert.equal(running.length, 1);
  assert.equal(running[0]?.kind, "background");
  assert.equal(running[0]?.id, job.id);
  assert.equal(running[0]?.pid, process.pid);
});

test("exit guard termination closes background executions even when pid is already gone", async (t) => {
  const root = await createTempWorkspace("exit-guard-terminate", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    command: "gone task",
    cwd: root,
    requestedBy: "lead",
  });
  store.markRunning(job.id, { pid: 999_999_999 });

  const result = await terminateProcesses([{ kind: "background", id: job.id, pid: 999_999_999, summary: "gone" }], root);
  const reloaded = store.load(job.id);

  assert.deepEqual(result.failedPids, []);
  assert.deepEqual(result.terminatedPids, [999_999_999]);
  assert.equal(reloaded?.status, "aborted");
});

test("exit guard collects and terminates agent worker executions from the same lifecycle family", async (t) => {
  const root = await createTempWorkspace("exit-guard-agent-workers", t);
  const store = new ExecutionStore(root);
  const subagent = store.create({
    kind: "subagent",
    prompt: "inspect config",
    cwd: root,
    requestedBy: "lead",
    actorName: "explorer",
  });
  store.markRunning(subagent.id, { pid: process.pid });

  const running = await collectRunningProcesses(root);
  const result = await terminateProcesses(running, root);

  assert.deepEqual(running.map((item) => item.kind), ["subagent"]);
  assert.deepEqual(result.failedPids, []);
  assert.deepEqual(result.terminatedPids, [process.pid]);
  assert.equal(store.load(subagent.id)?.status, "aborted");
});
