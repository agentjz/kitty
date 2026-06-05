import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createTempWorkspace } from "../helpers.js";

test("control plane ledger persists execution lifecycle facts", async (t) => {
  const root = await createTempWorkspace("control-ledger", t);
  const ledger = new ControlPlaneLedger(root);

  const created = ledger.executions.create({
    kind: "background",
    status: "created",
    command: "npm test",
    cwd: root,
    requestedBy: "lead",
    sessionId: "session-1",
  });

  ledger.executions.markRunning(created.id, { pid: 1234 });
  ledger.executions.close(created.id, {
    status: "completed",
    exitCode: 0,
    summary: "done",
  });

  const reader = new ControlPlaneLedger(root);
  const reloaded = reader.executions.load(created.id);
  reader.close();

  assert.equal(reloaded?.kind, "background");
  assert.equal(reloaded?.status, "completed");
  assert.equal(reloaded?.pid, 1234);
  assert.equal(reloaded?.exitCode, 0);
  assert.equal(reloaded?.sessionId, "session-1");
  assert.equal(reloaded?.waitPolicy?.lead, "none");
  assert.ok(reloaded?.startedAt);
  assert.ok(reloaded?.finishedAt);

  ledger.close();
});

test("control plane ledger persists execution wait policy facts", async (t) => {
  const root = await createTempWorkspace("control-wait-policy", t);
  const ledger = new ControlPlaneLedger(root);

  const created = ledger.executions.create({
    kind: "subagent",
    status: "created",
    prompt: "inspect context",
    cwd: root,
    requestedBy: "lead",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      scope: "global",
    },
  });

  const reader = new ControlPlaneLedger(root);
  const reloaded = reader.executions.load(created.id);
  reader.close();

  assert.equal(reloaded?.waitPolicy?.lead, "while_execution_active");
  assert.equal(reloaded?.waitPolicy?.wake, "required");
  assert.equal(reloaded?.waitPolicy?.scope, "global");

  ledger.close();
});

test("control plane ledger records wake signals as facts", async (t) => {
  const root = await createTempWorkspace("control-wake", t);
  const ledger = new ControlPlaneLedger(root);
  const execution = ledger.executions.create({
    kind: "background",
    status: "created",
    command: "long task",
    cwd: root,
    requestedBy: "lead",
  });

  const signal = ledger.wakeSignals.publish({
    executionId: execution.id,
    reason: "completed",
  });

  const reader = new ControlPlaneLedger(root);
  const signals = reader.wakeSignals.list();
  reader.close();

  assert.equal(signals.length, 1);
  assert.equal(signals[0]?.id, signal.id);
  assert.equal(signals[0]?.executionId, execution.id);
  assert.equal(signals[0]?.reason, "completed");

  ledger.close();
});

test("control plane ledger persists task lifecycle facts", async (t) => {
  const root = await createTempWorkspace("control-task-lifecycle", t);
  const ledger = new ControlPlaneLedger(root);

  const started = ledger.taskLifecycle.startTurn({
    sessionId: "session-1",
    reason: "turn_started",
  });
  const waiting = ledger.taskLifecycle.appendExecutionWait({
    sessionId: "session-1",
    executionIds: ["exec-1"],
    reason: "yield.execution_wait",
  });
  const completed = ledger.taskLifecycle.complete({
    sessionId: "session-1",
    verificationFacts: ["npm test passed"],
    completionFacts: ["Lifecycle persisted"],
  });

  const reader = new ControlPlaneLedger(root);
  const reloaded = reader.taskLifecycle.loadCurrent("session-1");
  reader.close();

  assert.equal(started.stage, "normal_work");
  assert.equal(waiting.stage, "delegated_wait");
  assert.equal(completed.stage, "completed");
  assert.equal(reloaded?.id, started.id);
  assert.deepEqual(reloaded?.activeExecutionIds, []);
  assert.deepEqual(reloaded?.verificationFacts, ["npm test passed"]);
  assert.deepEqual(reloaded?.completionFacts, ["Lifecycle persisted"]);

  ledger.close();
});
