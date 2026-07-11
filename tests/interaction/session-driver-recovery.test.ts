import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import Database from "better-sqlite3";
import test from "node:test";

import type { RunTurnOptions } from "../../src/agent/types.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { getProjectStatePaths } from "../../src/project/statePaths.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { createTuiInteractionShell } from "../../src/shell/tui/shell.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createAbortError } from "../../src/utils/abort.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("input submitted during interrupt cleanup is durably queued and runs next", async (t) => {
  const root = await createTempWorkspace("driver-interrupt-queue", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const controller = new TuiController(session);
  const shell = createTuiInteractionShell(controller);
  const firstStarted = deferred<void>();
  const firstAbortObserved = deferred<void>();
  const releaseFirstCleanup = deferred<void>();
  const secondCompleted = deferred<void>();
  const executionOrder: string[] = [];

  const driver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore,
    shell,
    localCommandHandler: async () => "continue",
    runTurn: async (options: RunTurnOptions) => {
      executionOrder.push(options.input);
      if (options.input === "first") {
        firstStarted.resolve();
        await waitForAbort(options.abortSignal);
        firstAbortObserved.resolve();
        await releaseFirstCleanup.promise;
        throw createAbortError("first interrupted");
      }
      const saved = await options.sessionStore.appendMessages(options.session, [
        createMessage("assistant", `${options.input}-done`),
      ]);
      secondCompleted.resolve();
      return completed(saved);
    },
  });

  const running = driver.run();
  controller.submitInput("first");
  await firstStarted.promise;
  controller.interrupt();
  await firstAbortObserved.promise;
  controller.submitInput("second");
  controller.interrupt();
  controller.interrupt();

  await waitUntil(() => readTurns(root, session.id).length === 2);
  assert.deepEqual(readTurns(root, session.id).map((turn) => turn.status), ["running", "queued"]);

  releaseFirstCleanup.resolve();
  await secondCompleted.promise;
  await waitUntil(() => readTurns(root, session.id).every((turn) => ["completed", "aborted"].includes(turn.status)));
  controller.closeInput();
  await running;

  assert.deepEqual(executionOrder, ["first", "second"]);
  assert.deepEqual(readTurns(root, session.id).map((turn) => turn.status), ["aborted", "completed"]);
  assert.equal((await sessionStore.load(session.id)).messages.some((message) => message.content === "second-done"), true);
});

test("accepted input is durable before asynchronous turn context preparation", async (t) => {
  const root = await createTempWorkspace("driver-admission-boundary", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const controller = new TuiController(session);
  const releaseContext = deferred<void>();
  const driver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore,
    shell: createTuiInteractionShell(controller),
    turnContextProvider: async () => {
      await releaseContext.promise;
      return {};
    },
    runTurn: async (options: RunTurnOptions) => completed(options.session),
  });

  const running = driver.run();
  controller.submitInput("persist before preparation");
  await waitUntil(() => readTurns(root, session.id).length === 1);

  assert.equal(readTurns(root, session.id)[0]?.status, "queued");
  assert.equal(readTurns(root, session.id)[0]?.input, "persist before preparation");

  controller.closeInput();
  releaseContext.resolve();
  await running;
  assert.equal(readTurns(root, session.id)[0]?.status, "queued");
});

test("driver restart consumes an admitted queued turn without duplicating it", async (t) => {
  const root = await createTempWorkspace("driver-restart-queue", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const ledger = new ControlPlaneLedger(root);
  const abandoned = ledger.turns.admit({
    sessionId: session.id,
    input: "abandoned running turn",
    inputSource: "external",
  });
  assert.ok(ledger.turns.claim(abandoned.id));
  const admitted = ledger.turns.admit({
    sessionId: session.id,
    input: "recover me",
    inputSource: "external",
  });
  ledger.turns.reconcileExpired(session.id, new Date(Date.now() + 31_000));
  ledger.close();

  const controller = new TuiController(session);
  const completedTurn = deferred<void>();
  const driver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore,
    shell: createTuiInteractionShell(controller),
    localCommandHandler: async () => "continue",
    runTurn: async (options: RunTurnOptions) => {
      const saved = await options.sessionStore.appendMessages(options.session, [
        createMessage("assistant", `${options.input}-done`),
      ]);
      completedTurn.resolve();
      return completed(saved);
    },
  });

  const running = driver.run();
  await completedTurn.promise;
  controller.closeInput();
  await running;

  const turns = readTurns(root, session.id);
  assert.equal(turns.length, 2);
  assert.equal(turns[0]?.id, abandoned.id);
  assert.equal(turns[0]?.status, "failed");
  assert.equal(turns[1]?.id, admitted.id);
  assert.equal(turns[1]?.status, "completed");
  assert.equal((await sessionStore.load(session.id)).messages.some((message) => message.content === "recover me-done"), true);
});

test("restart reconciles a recently orphaned running turn after its lease expires", async (t) => {
  const root = await createTempWorkspace("driver-running-reconcile", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const ledger = new ControlPlaneLedger(root);
  const runningTurn = ledger.turns.admit({
    sessionId: session.id,
    input: "orphan without a queued successor",
    inputSource: "external",
  });
  ledger.turns.claim(runningTurn.id);
  ledger.close();
  setTurnLeaseExpiry(root, runningTurn.id, new Date(Date.now() + 100));

  const controller = new TuiController(session);
  const driver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore,
    shell: createTuiInteractionShell(controller),
  });
  const running = driver.run();

  await waitUntil(() => readTurns(root, session.id)[0]?.status === "failed");
  assert.equal(
    controller.getState().transcript.some((entry) => entry.text.includes("Recovered 1 interrupted turn")),
    true,
  );
  controller.closeInput();
  await running;
});

test("hard-killed driver leaves accepted input recoverable without duplicate admission", async (t) => {
  const root = await createTempWorkspace("driver-hard-kill", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const child = spawn(process.execPath, [
    path.resolve(".test-build/tests/fixtures/driver-hard-kill-child.js"),
    root,
    session.id,
  ], {
    cwd: process.cwd(),
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => {
    if (child.exitCode === null) child.kill("SIGKILL");
  });

  await waitForChildReady(child);
  assert.equal(child.kill("SIGKILL"), true);
  await once(child, "exit");

  const afterKill = readTurns(root, session.id);
  assert.deepEqual(afterKill.map((turn) => turn.status), ["running", "queued"]);
  const queuedTurnId = afterKill[1]?.id;
  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(ledger.turns.reconcileExpired(session.id, new Date(Date.now() + 31_000)), 1);
  } finally {
    ledger.close();
  }

  const controller = new TuiController(await sessionStore.load(session.id));
  const recovered = deferred<void>();
  const replacement = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session: await sessionStore.load(session.id),
    sessionStore,
    shell: createTuiInteractionShell(controller),
    runTurn: async (options: RunTurnOptions) => {
      recovered.resolve();
      return completed(options.session);
    },
  });
  const replacementRun = replacement.run();
  await recovered.promise;
  controller.closeInput();
  await replacementRun;

  const recoveredTurns = readTurns(root, session.id);
  assert.equal(recoveredTurns.length, 2);
  assert.equal(recoveredTurns[0]?.status, "failed");
  assert.equal(recoveredTurns[1]?.id, queuedTurnId);
  assert.equal(recoveredTurns[1]?.status, "completed");
});

test("closing the terminal aborts the active owner but preserves accepted queued input for restart", async (t) => {
  const root = await createTempWorkspace("driver-close-recovery", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const firstController = new TuiController(session);
  const firstStarted = deferred<void>();
  const firstDriver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore,
    shell: createTuiInteractionShell(firstController),
    localCommandHandler: async () => "continue",
    runTurn: async (options: RunTurnOptions) => {
      firstStarted.resolve();
      await waitForAbort(options.abortSignal);
      throw createAbortError("terminal closed");
    },
  });

  const firstRun = firstDriver.run();
  firstController.submitInput("active");
  await firstStarted.promise;
  firstController.submitInput("survive restart");
  await waitUntil(() => readTurns(root, session.id).length === 2);
  firstController.closeInput();
  await firstRun;

  assert.deepEqual(readTurns(root, session.id).map((turn) => turn.status), ["aborted", "queued"]);

  const secondController = new TuiController(await sessionStore.load(session.id));
  const recovered = deferred<void>();
  const secondDriver = new InteractiveSessionDriver({
    cwd: root,
    stateRootDir: root,
    config,
    session: await sessionStore.load(session.id),
    sessionStore,
    shell: createTuiInteractionShell(secondController),
    localCommandHandler: async () => "continue",
    runTurn: async (options: RunTurnOptions) => {
      const saved = await options.sessionStore.appendMessages(options.session, [
        createMessage("assistant", `${options.input}-done`),
      ]);
      recovered.resolve();
      return completed(saved);
    },
  });

  const secondRun = secondDriver.run();
  await recovered.promise;
  secondController.closeInput();
  await secondRun;

  assert.deepEqual(readTurns(root, session.id).map((turn) => turn.status), ["aborted", "completed"]);
  assert.equal((await sessionStore.load(session.id)).messages.some((message) => message.content === "survive restart-done"), true);
});

function completed(session: Awaited<ReturnType<SessionStore["load"]>>) {
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

function readTurns(root: string, sessionId: string) {
  const ledger = new ControlPlaneLedger(root);
  try {
    return ledger.turns.listBySession(sessionId);
  } finally {
    ledger.close();
  }
}

function setTurnLeaseExpiry(root: string, turnId: string, expiresAt: Date): void {
  const db = new Database(getProjectStatePaths(root).controlPlaneLedgerFile);
  try {
    db.prepare("UPDATE session_turns SET lease_expires_at=? WHERE id=?").run(expiresAt.toISOString(), turnId);
  } finally {
    db.close();
  }
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for state transition.");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

async function waitForChildReady(child: ReturnType<typeof spawn>, timeoutMs = 5_000): Promise<void> {
  const timeout = setTimeout(() => child.kill("SIGKILL"), timeoutMs);
  try {
    let output = "";
    for await (const chunk of child.stdout!) {
      output += chunk.toString();
      if (output.includes("READY\n")) return;
    }
    const stderr = await readStream(child.stderr!);
    throw new Error(`Hard-kill fixture exited before ready: ${stderr}`);
  } finally {
    clearTimeout(timeout);
  }
}

async function readStream(stream: NodeJS.ReadableStream): Promise<string> {
  let output = "";
  for await (const chunk of stream) output += chunk.toString();
  return output;
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}
