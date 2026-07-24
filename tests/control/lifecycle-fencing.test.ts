import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { executionOwnership } from "../../src/control/types.js";
import { isLeaseOwnershipLostError } from "../../src/control/lease.js";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { createMessage } from "../../src/session/messages.js";
import { createSessionRecord } from "../../src/session/store.js";
import type { ToolResultEnvelope } from "../../src/types.js";
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
  }), isLeaseOwnershipLostError);
  assert.throws(() => ledger.toolCalls.activate({
    callId: "tool-0",
    turnId: turn.id,
    ownerToken: stale.ownerToken!,
    ownerGeneration: stale.ownerGeneration,
  }), isLeaseOwnershipLostError);
  assert.throws(() => ledger.turns.finish(
    turn.id,
    stale.ownerToken!,
    stale.ownerGeneration,
    "completed",
  ), isLeaseOwnershipLostError);
  assert.equal(ledger.turnSteers.load(steer.id)?.status, "pending");
  assert.equal(ledger.toolCalls.load(turn.id, "tool-0")?.status, "planned");
  assert.equal(ledger.turns.load(turn.id)?.ownerGeneration, current.ownerGeneration);
  ledger.close();
});

test("an unchanged turn owner renews after its deadline without losing durable writes", async (t) => {
  const root = await createTempWorkspace("turn-late-renewal", t);
  const ledger = new ControlPlaneLedger(root);
  let session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({ sessionId: session.id, input: "keep working", inputSource: "external" });
  const owner = ledger.turns.claim(turn.id)!;
  const steer = ledger.turnSteers.admit({ turnId: turn.id, sessionId: session.id, text: "more guidance" })!;
  ledger.toolCalls.start({
    callId: "tool-late",
    turnId: turn.id,
    sessionId: session.id,
    toolName: "read",
    argumentsJson: "{}",
    effect: "read",
  });

  expireTurnLease(root, turn.id);
  const lateSteer = ledger.turnSteers.admit({
    turnId: turn.id,
    sessionId: session.id,
    text: "guidance after a timer pause",
  });
  assert.ok(lateSteer);
  const heartbeat = ledger.turns.heartbeat(turn.id, owner.ownerToken!, owner.ownerGeneration);
  assert.ok(Date.parse(heartbeat.leaseExpiresAt!) > Date.now());

  expireTurnLease(root, turn.id);
  session = ledger.sessions.saveOwned({
    session,
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
  });
  assert.ok(Date.parse(ledger.turns.load(turn.id)!.leaseExpiresAt!) > Date.now());

  expireTurnLease(root, turn.id);
  ledger.turnSteers.markConsumed({
    steerId: steer.id,
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
  });
  expireTurnLease(root, turn.id);
  ledger.turnSteers.markConsumed({
    steerId: lateSteer!.id,
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
  });

  expireTurnLease(root, turn.id);
  ledger.toolCalls.activate({
    callId: "tool-late",
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
  });

  expireTurnLease(root, turn.id);
  const result: ToolResultEnvelope = {
    callId: "tool-late",
    toolName: "read",
    status: "success",
    summary: "done",
    modelView: "done",
    compactView: "done",
    facts: {},
    artifacts: [],
    truncation: { truncated: false, strategy: "none", projectedChars: 4 },
  };
  ledger.toolCalls.settle({
    callId: "tool-late",
    turnId: turn.id,
    ownerToken: owner.ownerToken!,
    ownerGeneration: owner.ownerGeneration,
    result,
  });

  expireTurnLease(root, turn.id);
  assert.equal(ledger.turns.beginClosing(turn.id, owner.ownerToken!, owner.ownerGeneration), true);
  expireTurnLease(root, turn.id);
  const finished = ledger.turns.finish(turn.id, owner.ownerToken!, owner.ownerGeneration, "completed");

  assert.equal(finished.status, "completed");
  assert.equal(ledger.turnSteers.load(steer.id)?.status, "consumed");
  assert.equal(ledger.turnSteers.load(lateSteer!.id)?.status, "consumed");
  assert.equal(ledger.toolCalls.load(turn.id, "tool-late")?.status, "success");
  assert.equal(ledger.sessions.load(session.id)?.revision, session.revision);
  ledger.close();
});

test("an unchanged execution controller renews after its deadline while recovery still fences stale generations", async (t) => {
  const root = await createTempWorkspace("execution-late-renewal", t);
  const ledger = new ControlPlaneLedger(root);
  const created = ledger.executions.create({
    ...TEST_EXECUTION_OWNER,
    command: "long command",
    cwd: root,
    requestedBy: "test",
  });
  const ownership = executionOwnership(created);

  expireExecutionLease(root, created.id);
  const heartbeat = ledger.executions.heartbeat(created.id, ownership);
  assert.ok(Date.parse(heartbeat.controllerLeaseExpiresAt) > Date.now());

  expireExecutionLease(root, created.id);
  const saved = ledger.executions.save({
    ...heartbeat,
    output: "still working",
    updatedAt: new Date().toISOString(),
  });
  assert.equal(saved.output, "still working");
  assert.ok(Date.parse(saved.controllerLeaseExpiresAt) > Date.now());

  expireExecutionLease(root, created.id);
  const replacement = ledger.executions.claimRecovery(created.id)!;
  assert.ok(replacement.controllerGeneration > ownership.controllerGeneration);
  assert.throws(() => ledger.executions.heartbeat(created.id, ownership), /ownership|stale|owns/i);
  assert.equal(ledger.executions.load(created.id)?.controllerGeneration, replacement.controllerGeneration);
  ledger.close();
});

test("a service owner can renew late unless a replacement generation wins first", async (t) => {
  const root = await createTempWorkspace("service-late-renewal", t);
  const ledger = new ControlPlaneLedger(root);
  const first = ledger.serviceLeases.acquire({ name: "telegram", processId: process.pid });

  expireServiceLease(root, first.name);
  const renewed = ledger.serviceLeases.heartbeat(first);
  assert.ok(Date.parse(renewed.leaseExpiresAt) > Date.now());

  expireServiceLease(root, first.name);
  const replacement = ledger.serviceLeases.acquire({ name: first.name, processId: process.pid });
  assert.ok(replacement.generation > first.generation);
  assert.throws(() => ledger.serviceLeases.heartbeat(renewed), /ownership|lost/i);
  assert.equal(ledger.serviceLeases.load(first.name)?.generation, replacement.generation);
  ledger.close();
});

function expireTurnLease(root: string, turnId: string): void {
  updateLease(root, "UPDATE session_turns SET lease_expires_at=? WHERE id=?", turnId);
}

function expireExecutionLease(root: string, executionId: string): void {
  updateLease(root, "UPDATE executions SET controller_lease_expires_at=? WHERE id=?", executionId);
}

function expireServiceLease(root: string, name: string): void {
  updateLease(root, "UPDATE service_leases SET lease_expires_at=? WHERE name=?", name);
}

function updateLease(root: string, sql: string, id: string): void {
  const db = new DatabaseSync(getProjectStatePaths(root).controlPlaneLedgerFile);
  try {
    db.prepare(sql).run("2000-01-01T00:00:00.000Z", id);
  } finally {
    db.close();
  }
}
