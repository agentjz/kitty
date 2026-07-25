import assert from "node:assert/strict";
import test from "node:test";
import { executionOwnership } from "../../src/control/types.js";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createSessionRecord } from "../../src/session/store.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

test("control plane ledger owns shell drafts independently from session messages", async (t) => {
  const root = await createTempWorkspace("control-interaction-draft", t);
  const ledger = new ControlPlaneLedger(root);
  ledger.interactionDrafts.save({
    sessionId: "session-draft",
    shell: "tui",
    value: "unfinished input",
    cursor: 5,
    updatedAt: "2026-07-12T00:00:00.000Z",
  });
  assert.equal(ledger.interactionDrafts.load("session-draft", "tui")?.value, "unfinished input");
  assert.equal(ledger.sessions.load("session-draft"), undefined);
  ledger.interactionDrafts.delete("session-draft", "tui");
  assert.equal(ledger.interactionDrafts.load("session-draft", "tui"), undefined);
  ledger.close();
});

test("control plane ledger persists execution lifecycle facts", async (t) => {
  const root = await createTempWorkspace("control-ledger", t);
  const ledger = new ControlPlaneLedger(root);

  const created = ledger.executions.create({
    ...TEST_EXECUTION_OWNER,
    status: "created",
    command: "npm test",
    cwd: root,
    requestedBy: "agent",
  });

  ledger.executions.markRunning(created.id, executionOwnership(created), { pid: 1234 });
  ledger.executions.close(created.id, executionOwnership(created), {
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
  assert.equal(reloaded?.ownerSessionId, TEST_EXECUTION_OWNER.ownerSessionId);
  assert.ok(reloaded?.startedAt);
  assert.ok(reloaded?.finishedAt);

  ledger.close();
});

test("control plane ledger records wake signals as facts", async (t) => {
  const root = await createTempWorkspace("control-wake", t);
  const ledger = new ControlPlaneLedger(root);
  const execution = ledger.executions.create({
    ...TEST_EXECUTION_OWNER,
    status: "created",
    command: "long task",
    cwd: root,
    requestedBy: "agent",
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
  assert.equal(waiting.stage, "background_wait");
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
  assert.throws(() => ledger.turns.assertOwner(first.id, "wrong-token", claimed!.ownerGeneration), /no longer owns/);
  ledger.turns.finish(first.id, claimed!.ownerToken!, claimed!.ownerGeneration, "completed");
  assert.equal(ledger.turns.claim(second.id)?.status, "running");
  ledger.close();
});

test("turn steers remain ordered inside one active turn and block closing until consumed", async (t) => {
  const root = await createTempWorkspace("control-turn-steers", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "start", inputSource: "external" });
  const claimed = ledger.turns.claim(turn.id)!;

  const first = ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "first guidance" });
  const second = ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "second guidance" });

  assert.ok(first);
  assert.ok(second);
  assert.deepEqual(ledger.turnSteers.listPending(turn.id).map((steer) => steer.input), [
    "first guidance",
    "second guidance",
  ]);
  assert.equal(ledger.turns.beginClosing(turn.id, claimed.ownerToken!, claimed.ownerGeneration), false);

  ledger.turnSteers.markConsumed({ steerId: first!.id, turnId: turn.id, ownerToken: claimed.ownerToken!, ownerGeneration: claimed.ownerGeneration });
  ledger.turnSteers.markConsumed({ steerId: second!.id, turnId: turn.id, ownerToken: claimed.ownerToken!, ownerGeneration: claimed.ownerGeneration });
  assert.equal(ledger.turns.beginClosing(turn.id, claimed.ownerToken!, claimed.ownerGeneration), true);
  assert.equal(
    ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "too late" }),
    undefined,
  );
  ledger.turns.finish(turn.id, claimed.ownerToken!, claimed.ownerGeneration, "completed");
  ledger.close();
});

test("expired running turns return to durable recovery with pending steers intact", async (t) => {
  const root = await createTempWorkspace("control-turn-steer-recovery", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "start", inputSource: "external" });
  ledger.turns.claim(turn.id);
  const steer = ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "survive crash" });

  assert.equal(ledger.turns.reconcileExpired(session.id, new Date(Date.now() + 31_000)), 1);
  assert.equal(ledger.turns.load(turn.id)?.status, "queued");
  assert.equal(ledger.turnSteers.load(steer!.id)?.status, "pending");
  assert.equal(ledger.turns.claim(turn.id)?.status, "running");
  ledger.close();
});

test("aborting a queued turn rejects its pending steers in the same ledger transition", async (t) => {
  const root = await createTempWorkspace("control-queued-steer-abort", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "start", inputSource: "external" });
  const steer = ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "queued guidance" })!;

  ledger.turns.abortQueued(turn.id, "Explicitly cancelled before execution.");

  assert.equal(ledger.turns.load(turn.id)?.status, "aborted");
  assert.equal(ledger.turnSteers.load(steer.id)?.status, "rejected");
  assert.equal(ledger.turnSteers.load(steer.id)?.rejectionReason, "Explicitly cancelled before execution.");
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
  ledger.toolCalls.activate({
    callId: "call-edit",
    turnId: turn.id,
    ownerToken: claimed.ownerToken!,
    ownerGeneration: claimed.ownerGeneration,
  });
  ledger.turns.finish(turn.id, claimed.ownerToken!, claimed.ownerGeneration, "failed", "process crashed");

  const [recovered] = ledger.toolCalls.interruptRecoverable(session.id);
  assert.equal(recovered?.status, "uncertain");
  assert.equal(recovered?.result?.error?.code, "TOOL_RESULT_UNCERTAIN");
  assert.equal(recovered?.result?.provenance?.targetPath, "src/app.ts");
  assert.match(recovered?.result?.error?.recoveryHint ?? "", /Inspect the target state/);
  ledger.close();
});

test("tool journal settles effects aborted before activation as interrupted", async (t) => {
  const root = await createTempWorkspace("control-tool-planned-abort", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "edit", inputSource: "external" });
  const claimed = ledger.turns.claim(turn.id)!;
  ledger.toolCalls.start({
    callId: "call-planned",
    turnId: turn.id,
    sessionId: session.id,
    toolName: "edit",
    argumentsJson: JSON.stringify({ path: "src/app.ts" }),
    effect: "write",
  });
  ledger.turns.finish(turn.id, claimed.ownerToken!, claimed.ownerGeneration, "aborted", "stopped before tool start");

  const [recovered] = ledger.toolCalls.interruptRecoverable(session.id);
  assert.equal(recovered?.status, "interrupted");
  ledger.close();
});

test("execution close publishes exactly one wake signal", async (t) => {
  const root = await createTempWorkspace("control-atomic-wake", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "inspect",
    cwd: root,
    requestedBy: "agent",
  });
  const ownership = executionOwnership(execution);
  store.close(execution.id, ownership, { status: "completed", summary: "done" });
  store.close(execution.id, ownership, { status: "completed", summary: "done" });
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
