import assert from "node:assert/strict";
import test from "node:test";
import { executionOwnership } from "../../src/control/types.js";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createMessage } from "../../src/session/messages.js";
import { createSessionRecord } from "../../src/session/store.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

test("session history rejects deletion, reordering, and same-id mutation", async (t) => {
  const root = await createTempWorkspace("session-strict-append", t);
  const ledger = new ControlPlaneLedger(root);

  let session = ledger.sessions.save(await createSessionRecord(root));
  session = ledger.sessions.save({
    ...session,
    messages: [createMessage("user", "one"), createMessage("assistant", "two")],
  });

  assert.throws(() => ledger.sessions.save({
    ...session,
    messages: session.messages.slice(0, 1),
  }), /append-only/i);
  assert.throws(() => ledger.sessions.save({
    ...session,
    messages: [...session.messages].reverse(),
  }), /append-only/i);
  assert.throws(() => ledger.sessions.save({
    ...session,
    messages: session.messages.map((message, index) => index === 0
      ? { ...message, content: "mutated" }
      : message),
  }), /append-only/i);
  ledger.close();
});

test("stale execution snapshots cannot overwrite a terminal state", async (t) => {
  const root = await createTempWorkspace("execution-terminal-fence", t);
  const ledger = new ControlPlaneLedger(root);

  const created = ledger.executions.create({
    ...TEST_EXECUTION_OWNER,
    command: "long command",
    cwd: root,
    requestedBy: "agent",
  });
  const ownership = executionOwnership(created);
  const running = ledger.executions.markRunning(created.id, ownership, { pid: process.pid });
  ledger.transaction(() => {
    const closed = ledger.executions.close(created.id, ownership, { status: "completed", summary: "done" });
    ledger.wakeSignals.publish({ executionId: created.id, reason: "completed" });
  });

  assert.throws(() => ledger.executions.save({
    ...running,
    output: "late output",
    updatedAt: new Date().toISOString(),
  }), /stale|transition|terminal|version/i);
  assert.equal(ledger.executions.load(created.id)?.status, "completed");
  assert.equal(ledger.wakeSignals.list().filter((signal) => signal.executionId === created.id).length, 1);
  ledger.close();
});

test("provider call ids are isolated by turn", async (t) => {
  const root = await createTempWorkspace("tool-call-turn-identity", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const first = ledger.turns.admit({ sessionId: session.id, input: "first", inputSource: "external" });
  const second = ledger.turns.admit({ sessionId: session.id, input: "second", inputSource: "external" });

  const firstCall = ledger.toolCalls.start({
    callId: "tool-0",
    turnId: first.id,
    sessionId: session.id,
    toolName: "read",
    argumentsJson: "{}",
    effect: "read",
  });
  const secondCall = ledger.toolCalls.start({
    callId: "tool-0",
    turnId: second.id,
    sessionId: session.id,
    toolName: "write",
    argumentsJson: "{}",
    effect: "write",
  });

  assert.equal(firstCall.turnId, first.id);
  assert.equal(secondCall.turnId, second.id);
  assert.equal(ledger.toolCalls.listBySession(session.id).length, 2);
  ledger.close();
});

test("recovery generations fence stale execution controllers", async (t) => {
  const root = await createTempWorkspace("execution-controller-generation", t);
  const store = new (await import("../../src/execution/background.js")).BackgroundExecutionStore(root);
  const execution = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "stale controller",
    cwd: root,
    requestedBy: "test",
  });
  const stale = executionOwnership(execution);
  store.markRunning(execution.id, stale, { pid: 999_999_999 });
  const ledger = new ControlPlaneLedger(root);
  const replacement = ledger.executions.claimCancellation(execution.id, execution.ownerSessionId)!;
  ledger.close();
  assert.ok(replacement.controllerGeneration > execution.controllerGeneration);
  assert.throws(() => store.updateRunningOutput(execution.id, stale, { output: "stale" }), /stale/i);
});

test("a replaced turn generation cannot write any durable turn-owned fact", async (t) => {
  const root = await createTempWorkspace("turn-generation-fence", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "first owner", inputSource: "external" });
  const stale = ledger.turns.claim(turn.id)!;
  const steer = ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "guidance" })!;
  ledger.toolCalls.start({
    callId: "tool-0",
    turnId: turn.id,
    sessionId: session.id,
    toolName: "write",
    argumentsJson: "{}",
    effect: "write",
  });
  ledger.turns.reconcileExpired(session.id, new Date(Date.now() + 31_000));
  const current = ledger.turns.claim(turn.id)!;
  assert.ok(current.ownerGeneration > stale.ownerGeneration);

  assert.throws(() => ledger.sessions.saveOwned({
    session,
    turnId: turn.id,
    ownerToken: stale.ownerToken!,
    ownerGeneration: stale.ownerGeneration,
  }), /no longer owns/i);
  assert.throws(() => ledger.turnSteers.markConsumed({
    steerId: steer.id,
    turnId: turn.id,
    ownerToken: stale.ownerToken!,
    ownerGeneration: stale.ownerGeneration,
  }), /active turn lease/i);
  assert.throws(() => ledger.toolCalls.activate({
    callId: "tool-0",
    turnId: turn.id,
    ownerToken: stale.ownerToken!,
    ownerGeneration: stale.ownerGeneration,
  }), /active turn lease/i);
  assert.throws(() => ledger.turns.finish(
    turn.id,
    stale.ownerToken!,
    stale.ownerGeneration,
    "completed",
  ), /active lease/i);
  assert.equal(ledger.turnSteers.load(steer.id)?.status, "pending");
  assert.equal(ledger.toolCalls.load(turn.id, "tool-0")?.status, "planned");
  assert.equal(ledger.turns.load(turn.id)?.ownerGeneration, current.ownerGeneration);
  ledger.close();
});
