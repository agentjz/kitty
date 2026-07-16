import assert from "node:assert/strict";
import test from "node:test";

import {
  BackgroundExecutionStore,
  reconcileBackgroundExecutions,
} from "../../src/execution/background.js";
import { waitForBackgroundExecutionChange } from "../../src/execution/backgroundWait.js";
import { isAbortError } from "../../src/utils/abort.js";
import { executionOwnership } from "../../src/control/types.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createSessionRecord } from "../../src/session/store.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { openControlDatabase } from "../../src/control/sqlite.js";

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

  const ownership = executionOwnership(job);
  store.markRunning(job.id, ownership, { pid: 4321 });
  const closed = store.close(job.id, ownership, {
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
  store.markRunning(job.id, executionOwnership(job), { pid: 999_999_999 });
  const db = openControlDatabase(getProjectStatePaths(root).controlPlaneLedgerFile);
  db.prepare("UPDATE executions SET controller_lease_expires_at = ? WHERE id = ?")
    .run("2000-01-01T00:00:00.000Z", job.id);
  db.close();

  const result = reconcileBackgroundExecutions(root);
  const reloaded = store.load(job.id);

  assert.equal(result.lostExecutions.length, 1);
  assert.equal(reloaded?.status, "lost");
  assert.match(String(reloaded?.summary), /lease expired/i);
});

test("background reconcile never steals a healthy controller lease", async (t) => {
  const root = await createTempWorkspace("background-reconcile-healthy", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "healthy process",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, executionOwnership(job), { pid: process.pid });

  assert.equal(reconcileBackgroundExecutions(root).lostExecutions.length, 0);
  assert.equal(store.load(job.id)?.controllerGeneration, job.controllerGeneration);
  assert.equal(store.load(job.id)?.status, "running");
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
  const ownership = executionOwnership(job);
  store.markRunning(job.id, ownership, { pid: process.pid });

  store.updateRunningOutput(job.id, ownership, {
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
  store.markRunning(job.id, executionOwnership(job), { pid: process.pid });
  const controller = new AbortController();
  controller.abort();

  await assert.rejects(
    () => waitForBackgroundExecutionChange({
      rootDir: root,
      id: job.id,
      ownerSessionId: job.ownerSessionId,
      turnId: job.parentTurnId,
      abortSignal: controller.signal,
    }),
    isAbortError,
  );
  assert.equal(store.load(job.id)?.status, "running");
});

test("an abandoned background wait is recoverable read evidence, not an uncertain side effect", async (t) => {
  const root = await createTempWorkspace("background-wait-recovery", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  const turn = ledger.turns.admit({
    sessionId: session.id,
    input: "wait for the background task",
    inputSource: "external",
  });
  const claimed = ledger.turns.claim(turn.id)!;
  ledger.toolCalls.start({
    callId: "call-background-wait",
    turnId: turn.id,
    sessionId: session.id,
    toolName: "background_wait",
    argumentsJson: JSON.stringify({ id: "execution-under-review" }),
    effect: "read",
  });
  ledger.toolCalls.activate({
    callId: "call-background-wait",
    turnId: turn.id,
    ownerToken: claimed.ownerToken!,
    ownerGeneration: claimed.ownerGeneration,
  });
  ledger.turns.finish(turn.id, claimed.ownerToken!, claimed.ownerGeneration, "failed", "host disappeared");

  const [recovered] = ledger.toolCalls.interruptRecoverable(session.id);
  assert.equal(recovered?.toolName, "background_wait");
  assert.equal(recovered?.effect, "read");
  assert.equal(recovered?.status, "interrupted");
  assert.equal(recovered?.result?.error?.code, "TOOL_EXECUTION_INTERRUPTED");
  ledger.close();
});

test("background wait returns coalesced running progress before the quiet timeout", async (t) => {
  const root = await createTempWorkspace("background-wait-progress", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "progress command",
    cwd: root,
    requestedBy: "agent",
  });
  const ownership = executionOwnership(job);
  store.markRunning(job.id, ownership, { pid: process.pid });

  const waiting = waitForBackgroundExecutionChange({
    rootDir: root,
    id: job.id,
    ownerSessionId: job.ownerSessionId,
    turnId: job.parentTurnId,
    timeoutMs: 2_000,
    fallbackPollMs: 10,
    progressDebounceMs: 50,
  });
  setTimeout(() => store.updateRunningOutput(job.id, ownership, {
    output: "phase one\n",
    summary: "phase one",
    lastOutputAt: "2026-07-16T00:00:01.000Z",
  }), 10);
  setTimeout(() => store.updateRunningOutput(job.id, ownership, {
    output: "phase one\nphase two\n",
    summary: "phase two",
    lastOutputAt: "2026-07-16T00:00:02.000Z",
  }), 30);

  const result = await waiting;
  assert.equal(result.reason, "progress");
  assert.equal(result.changed, true);
  assert.equal(result.execution.status, "running");
  assert.equal(result.execution.summary, "phase two");
  assert.match(result.execution.output ?? "", /phase two/);
  assert.ok(result.waitedMs < 1_000);
});

test("background wait stays silent until its explicit quiet timeout", async (t) => {
  const root = await createTempWorkspace("background-wait-quiet", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "quiet command",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, executionOwnership(job), { pid: process.pid });

  const result = await waitForBackgroundExecutionChange({
    rootDir: root,
    id: job.id,
    ownerSessionId: job.ownerSessionId,
    turnId: job.parentTurnId,
    timeoutMs: 80,
    fallbackPollMs: 10,
    progressDebounceMs: 10,
  });

  assert.equal(result.reason, "quiet_timeout");
  assert.equal(result.changed, false);
  assert.equal(result.execution.status, "running");
  assert.ok(result.waitedMs >= 60);
});

test("background wait returns immediately for a settled execution", async (t) => {
  const root = await createTempWorkspace("background-wait-settled", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "settled command",
    cwd: root,
    requestedBy: "agent",
  });
  store.close(job.id, executionOwnership(job), {
    status: "completed",
    exitCode: 0,
    output: "done",
    summary: "done",
  });

  const result = await waitForBackgroundExecutionChange({
    rootDir: root,
    id: job.id,
    ownerSessionId: job.ownerSessionId,
    turnId: job.parentTurnId,
    timeoutMs: 2_000,
  });

  assert.equal(result.reason, "settled");
  assert.equal(result.changed, true);
  assert.equal(result.execution.status, "completed");
});

test("background wait yields to durable user steering without consuming it", async (t) => {
  const root = await createTempWorkspace("background-wait-steer", t);
  const setupLedger = new ControlPlaneLedger(root);
  const session = setupLedger.sessions.save(await createSessionRecord(root));
  const turn = setupLedger.turns.admit({
    sessionId: session.id,
    input: "run the background task",
    inputSource: "external",
  });
  setupLedger.turns.claim(turn.id);
  setupLedger.close();
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    ownerSessionId: session.id,
    createdBySessionId: session.id,
    parentTurnId: turn.id,
    originToolCallId: "test-background-wait-steer",
    command: "steered command",
    cwd: root,
    requestedBy: "agent",
  });
  store.markRunning(job.id, executionOwnership(job), { pid: process.pid });

  const waiting = waitForBackgroundExecutionChange({
    rootDir: root,
    id: job.id,
    ownerSessionId: job.ownerSessionId,
    turnId: job.parentTurnId,
    timeoutMs: 2_000,
    fallbackPollMs: 10,
  });
  setTimeout(() => {
    const ledger = new ControlPlaneLedger(root);
    try {
      ledger.turnSteers.admit({
        turnId: job.parentTurnId,
        sessionId: job.ownerSessionId,
        text: "change the acceptance target",
      });
    } finally {
      ledger.close();
    }
  }, 20);

  const result = await waiting;
  assert.equal(result.reason, "steer");
  assert.equal(result.changed, false);
  const ledger = new ControlPlaneLedger(root);
  try {
    assert.deepEqual(ledger.turnSteers.listPending(job.parentTurnId).map((item) => item.input), [
      "change the acceptance target",
    ]);
  } finally {
    ledger.close();
  }
});
