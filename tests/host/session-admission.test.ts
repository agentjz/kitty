import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { runHostTurn } from "../../src/host/turn.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("concurrent host turns serialize by durable session admission without losing messages", async (t) => {
  const root = await createTempWorkspace("host-session-admission", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const executionOrder: string[] = [];

  const runTurn = async (options: RunTurnOptions) => {
    executionOrder.push(options.input);
    if (options.input === "first") await new Promise((resolve) => setTimeout(resolve, 80));
    const saved = await options.sessionStore.appendMessages(options.session, [
      createMessage("assistant", `${options.input}-done`),
    ]);
    return {
      session: saved,
      changedPaths: [],
      transition: {
        action: "finalize" as const,
        reason: { code: "finalize.completed" as const, changedPaths: [] },
        timestamp: new Date().toISOString(),
      },
    };
  };
  const dependencies = {
    createToolRegistry: async () => createToolRegistry({ onlyNames: [] }),
    runTurn,
  };

  const first = runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "first",
    cwd: root,
    config,
    session,
    sessionStore,
  }, dependencies);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "second",
    cwd: root,
    config,
    session,
    sessionStore,
  }, dependencies);

  const outcomes = await Promise.all([first, second]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["completed", "completed"]);
  assert.deepEqual(executionOrder, ["first", "second"]);
  const loaded = await sessionStore.load(session.id);
  assert.deepEqual(loaded.messages.map((message) => message.content), ["first-done", "second-done"]);
});

test("host turn completes after a missed deadline when no replacement owner exists", async (t) => {
  const root = await createTempWorkspace("host-turn-late-renewal", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  let turnId = "";

  const outcome = await runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "resume after pause",
    cwd: root,
    config,
    session,
    sessionStore,
  }, {
    createToolRegistry: async () => createToolRegistry({ onlyNames: [] }),
    runTurn: async (options) => {
      turnId = options.turnId!;
      expireTurnLease(root, turnId);
      return completed(options.session);
    },
  });

  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(outcome.status, "completed");
    assert.equal(ledger.turns.load(turnId)?.status, "completed");
    const hostEvents = ledger.runtimeEvents.list().filter((event) => event.event === "host.turn");
    assert.deepEqual(hostEvents.map((event) => event.status).sort(), ["completed", "started"]);
    assert.ok(hostEvents.every((event) => event.turnId === turnId));
  } finally {
    ledger.close();
  }
});

test("host turn returns recoverable abort after a replacement generation takes ownership", async (t) => {
  const root = await createTempWorkspace("host-turn-takeover", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  let turnId = "";
  let replacement: ReturnType<ControlPlaneLedger["turns"]["claim"]>;

  const outcome = await runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "old owner",
    cwd: root,
    config,
    session,
    sessionStore,
  }, {
    createToolRegistry: async () => createToolRegistry({ onlyNames: [] }),
    runTurn: async (options) => {
      turnId = options.turnId!;
      expireTurnLease(root, turnId);
      const ledger = new ControlPlaneLedger(root);
      try {
        assert.equal(ledger.turns.reconcileExpired(session.id), 1);
        replacement = ledger.turns.claim(turnId);
      } finally {
        ledger.close();
      }
      return completed(options.session);
    },
  });

  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(outcome.status, "aborted");
    assert.doesNotMatch(outcome.errorMessage ?? "", /lease|owns|generation/i);
    assert.equal(ledger.turns.load(turnId)?.ownerGeneration, replacement!.ownerGeneration);
    assert.equal(ledger.turns.load(turnId)?.status, "running");
    const finished = ledger.runtimeEvents.list().find((event) =>
      event.event === "host.turn" && event.status === "aborted");
    assert.equal(finished?.turnId, turnId);
    ledger.turns.finish(turnId, replacement!.ownerToken!, replacement!.ownerGeneration, "aborted");
  } finally {
    ledger.close();
  }
});

test("host turn never exposes a terminal ledger lease error from another owner", async (t) => {
  const root = await createTempWorkspace("host-turn-settled-error", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const ledger = new ControlPlaneLedger(root);
  let turnId = "";
  try {
    const turn = ledger.turns.admit({ sessionId: session.id, input: "already settled", inputSource: "external" });
    turnId = turn.id;
    const owner = ledger.turns.claim(turn.id)!;
    ledger.turns.finish(
      turn.id,
      owner.ownerToken!,
      owner.ownerGeneration,
      "failed",
      "Turn lease expired while final output was closing.",
    );
  } finally {
    ledger.close();
  }

  const outcome = await runHostTurn({
    host: "test",
    stateRootDir: root,
    admittedTurnId: turnId,
    input: "already settled",
    cwd: root,
    config,
    session,
    sessionStore,
  });

  assert.equal(outcome.status, "failed");
  assert.doesNotMatch(outcome.errorMessage ?? "", /lease|owns|generation/i);
});

test("host turn does not report completion when durable finalization fails", async (t) => {
  const root = await createTempWorkspace("host-turn-finalization-failure", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  let turnId = "";

  const outcome = await runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "conflicting finalization",
    cwd: root,
    config,
    session,
    sessionStore,
  }, {
    createToolRegistry: async () => createToolRegistry({ onlyNames: [] }),
    runTurn: async (options) => {
      turnId = options.turnId!;
      const concurrent = new ControlPlaneLedger(root);
      try {
        concurrent.sessions.save({ ...options.session, title: "concurrent revision" });
      } finally {
        concurrent.close();
      }
      return completed(options.session);
    },
  });

  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(outcome.status, "failed");
    assert.doesNotMatch(outcome.errorMessage ?? "", /revision|lease|owns|generation/i);
    assert.notEqual(ledger.turns.load(turnId)?.status, "completed");
    const finished = ledger.runtimeEvents.list().find((event) =>
      event.event === "host.turn" && event.status === "failed");
    assert.equal(finished?.turnId, turnId);
    expireTurnLease(root, turnId);
    ledger.turns.reconcileExpired(session.id);
  } finally {
    ledger.close();
  }
});

function completed(session: RunTurnOptions["session"]) {
  return {
    session,
    changedPaths: [],
    transition: {
      action: "finalize" as const,
      reason: { code: "finalize.completed" as const, changedPaths: [] },
      timestamp: new Date().toISOString(),
    },
  };
}

function expireTurnLease(root: string, turnId: string): void {
  const db = new DatabaseSync(getProjectStatePaths(root).controlPlaneLedgerFile);
  try {
    db.prepare("UPDATE session_turns SET lease_expires_at=? WHERE id=?")
      .run("2000-01-01T00:00:00.000Z", turnId);
  } finally {
    db.close();
  }
}
