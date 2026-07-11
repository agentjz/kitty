import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createSessionRecord } from "../../src/session/store.js";
import { ExecutionStore } from "../../src/execution/store.js";
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

test("session turns claim only the durable queue head and fence expired owners", async (t) => {
  const root = await createTempWorkspace("control-turn-claim", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const first = ledger.turns.admit({ sessionId: session.id, input: "first", inputSource: "external" });
  const second = ledger.turns.admit({ sessionId: session.id, input: "second", inputSource: "external" });

  assert.equal(ledger.turns.claim(second.id), undefined);
  const claimed = ledger.turns.claim(first.id);
  assert.equal(claimed?.status, "running");
  assert.ok(claimed?.ownerToken);
  assert.throws(() => ledger.turns.assertOwner(first.id, "wrong-token"), /no longer owns/);
  ledger.turns.finish(first.id, claimed!.ownerToken!, "completed");
  assert.equal(ledger.turns.claim(second.id)?.status, "running");
  ledger.close();
});

test("tool journal converts abandoned side effects into explicit recovery evidence", async (t) => {
  const root = await createTempWorkspace("control-tool-recovery", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "edit", inputSource: "external" });
  const claimed = ledger.turns.claim(turn.id)!;
  ledger.toolCalls.start({
    callId: "call-edit",
    turnId: turn.id,
    sessionId: session.id,
    toolName: "edit",
    argumentsJson: JSON.stringify({ path: "src/app.ts" }),
    effect: "write",
  });
  ledger.turns.finish(turn.id, claimed.ownerToken!, "failed", "process crashed");

  const [recovered] = ledger.toolCalls.interruptRecoverable(session.id);
  assert.equal(recovered?.status, "interrupted");
  assert.equal(recovered?.result?.error?.code, "TOOL_EXECUTION_INTERRUPTED");
  assert.equal(recovered?.result?.provenance?.targetPath, "src/app.ts");
  assert.match(recovered?.result?.error?.recoveryHint ?? "", /Inspect the target state/);
  ledger.close();
});

test("execution close publishes exactly one wake signal", async (t) => {
  const root = await createTempWorkspace("control-atomic-wake", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "inspect",
    cwd: root,
    requestedBy: "lead",
  });
  store.close(execution.id, { status: "completed", summary: "done" });
  store.close(execution.id, { status: "completed", summary: "done" });
  assert.equal(store.listWakeSignals().filter((signal) => signal.executionId === execution.id).length, 1);
});

test("context epochs persist source hash and budget facts", async (t) => {
  const root = await createTempWorkspace("control-context-epoch", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  ledger.contextEpochs.record({
    sessionId: session.id,
    sourceMessageCount: 3,
    sourceLastMessageId: "message-3",
    sourcePrefixHash: "a".repeat(64),
    summary: "durable summary",
    budget: {
      limitChars: 1000,
      estimatedChars: 700,
      remainingChars: 300,
      usageRatio: 0.7,
      compressed: true,
      compressionMode: "normal",
      compressionReason: "automatic_compaction",
      sources: [],
      promptHotspots: [],
    },
  });
  const epoch = ledger.contextEpochs.loadLatest(session.id);
  assert.equal(epoch?.sourcePrefixHash, "a".repeat(64));
  assert.equal(epoch?.budget.estimatedChars, 700);
  ledger.close();
});
