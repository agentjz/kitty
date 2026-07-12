import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import path from "node:path";
import test from "node:test";

import type { RunTurnOptions } from "../../src/agent/types.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { InteractiveSessionDriver } from "../../src/interaction/sessionDriver.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { TuiController } from "../../src/shell/tui/controller.js";
import { createTuiInteractionShell } from "../../src/shell/tui/shell.js";
import { createAbortError } from "../../src/utils/abort.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("input submitted during an active turn steers that turn instead of creating another turn", async (t) => {
  const fixture = await createDriverFixture("driver-active-steer", t);
  const started = deferred<void>();
  const releaseConsumption = deferred<void>();
  const completedTurn = deferred<void>();
  const observedInputs: string[] = [];
  const driver = fixture.createDriver(async (options) => {
    observedInputs.push(options.input);
    started.resolve();
    await releaseConsumption.promise;
    const steered = await options.steering!.consumePending(options.session);
    assert.deepEqual(steered.inputs, ["refine the active work"]);
    const saved = await options.sessionStore.appendMessages(steered.session, [
      createMessage("assistant", "refined result"),
    ]);
    completedTurn.resolve();
    return completed(saved);
  });

  const running = driver.run();
  fixture.controller.submitInput("start work");
  await started.promise;
  fixture.controller.submitInput("refine the active work");
  await waitUntil(() => readSteers(fixture.root, fixture.session.id).length === 1);

  assert.equal(fixture.controller.getState().transcript.filter(
    (entry) => entry.role === "user" && entry.text === "refine the active work",
  ).length, 1);
  assert.equal(readTurns(fixture.root, fixture.session.id).length, 1);
  assert.equal(readTurns(fixture.root, fixture.session.id)[0]?.status, "running");
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["pending"]);

  releaseConsumption.resolve();
  await completedTurn.promise;
  await waitUntil(() => readTurns(fixture.root, fixture.session.id)[0]?.status === "completed");
  fixture.controller.closeInput();
  await running;

  assert.deepEqual(observedInputs, ["start work"]);
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["consumed"]);
  assert.equal((await fixture.sessionStore.load(fixture.session.id)).messages.some(
    (message) => message.content === "refine the active work",
  ), true);
});

test("accepted initial input is durable before asynchronous turn context preparation", async (t) => {
  const fixture = await createDriverFixture("driver-admission-boundary", t);
  const releaseContext = deferred<void>();
  const driver = new InteractiveSessionDriver({
    cwd: fixture.root,
    stateRootDir: fixture.root,
    config: fixture.config,
    session: fixture.session,
    sessionStore: fixture.sessionStore,
    shell: createTuiInteractionShell(fixture.controller),
    turnContextProvider: async () => {
      await releaseContext.promise;
      return {};
    },
    runTurn: async (options) => completed(options.session),
  });

  const running = driver.run();
  fixture.controller.submitInput("persist before preparation");
  await waitUntil(() => readTurns(fixture.root, fixture.session.id).length === 1);
  assert.equal(readTurns(fixture.root, fixture.session.id)[0]?.status, "queued");

  fixture.controller.closeInput();
  releaseContext.resolve();
  await running;
  assert.equal(readTurns(fixture.root, fixture.session.id)[0]?.status, "queued");
});

test("expired active turn resumes with its pending steer and no duplicate turn admission", async (t) => {
  const fixture = await createDriverFixture("driver-steer-recovery", t);
  const ledger = new ControlPlaneLedger(fixture.root);
  const turn = ledger.turns.admit({ sessionId: fixture.session.id, input: "recover work", inputSource: "external" });
  ledger.turns.claim(turn.id);
  const steer = ledger.turnSteers.admit({
    turnId: turn.id,
    sessionId: fixture.session.id,
    text: "recovered guidance",
  })!;
  assert.equal(ledger.turns.reconcileExpired(fixture.session.id, new Date(Date.now() + 31_000)), 1);
  ledger.close();

  const resumed = deferred<void>();
  const driver = fixture.createDriver(async (options) => {
    const steered = await options.steering!.consumePending(options.session);
    assert.deepEqual(steered.inputs, ["recovered guidance"]);
    resumed.resolve();
    return completed(steered.session);
  });
  const running = driver.run();
  await resumed.promise;
  await waitUntil(() => readTurns(fixture.root, fixture.session.id)[0]?.status === "completed");
  fixture.controller.closeInput();
  await running;

  assert.equal(readTurns(fixture.root, fixture.session.id).length, 1);
  assert.equal(readTurns(fixture.root, fixture.session.id)[0]?.id, turn.id);
  assert.equal(readSteers(fixture.root, fixture.session.id)[0]?.id, steer.id);
  assert.equal(readSteers(fixture.root, fixture.session.id)[0]?.status, "consumed");
});

test("hard-killed driver preserves the active turn and steer for same-turn recovery", async (t) => {
  const fixture = await createDriverFixture("driver-hard-kill-steer", t);
  const child = spawn(process.execPath, [
    path.resolve(".test-build/tests/fixtures/driver-hard-kill-child.js"),
    fixture.root,
    fixture.session.id,
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
  const activeTurn = readTurns(fixture.root, fixture.session.id)[0]!;
  assert.equal(activeTurn.status, "running");
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["pending"]);

  const ledger = new ControlPlaneLedger(fixture.root);
  try {
    assert.equal(ledger.turns.reconcileExpired(fixture.session.id, new Date(Date.now() + 31_000)), 1);
  } finally {
    ledger.close();
  }

  const recovered = deferred<void>();
  const replacement = fixture.createDriver(async (options) => {
    const steered = await options.steering!.consumePending(options.session);
    assert.deepEqual(steered.inputs, ["survive hard kill"]);
    recovered.resolve();
    return completed(steered.session);
  });
  const replacementRun = replacement.run();
  await recovered.promise;
  await waitUntil(() => readTurns(fixture.root, fixture.session.id)[0]?.status === "completed");
  fixture.controller.closeInput();
  await replacementRun;

  assert.equal(readTurns(fixture.root, fixture.session.id).length, 1);
  assert.equal(readTurns(fixture.root, fixture.session.id)[0]?.id, activeTurn.id);
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["consumed"]);
});

test("Ctrl+C aborts the active turn and rejects its unconsumed steers", async (t) => {
  const fixture = await createDriverFixture("driver-interrupt-steer", t);
  const started = deferred<void>();
  const driver = fixture.createDriver(async (options) => {
    started.resolve();
    await waitForAbort(options.abortSignal);
    throw createAbortError("interrupted");
  });

  const running = driver.run();
  fixture.controller.submitInput("active");
  await started.promise;
  fixture.controller.submitInput("guidance before abort");
  await waitUntil(() => readSteers(fixture.root, fixture.session.id).length === 1);
  fixture.controller.interrupt();
  await waitUntil(() => readTurns(fixture.root, fixture.session.id)[0]?.status === "aborted");
  fixture.controller.closeInput();
  await running;

  assert.equal(readTurns(fixture.root, fixture.session.id).length, 1);
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["rejected"]);
});

test("input submitted during interrupt cleanup becomes the next durable turn", async (t) => {
  const fixture = await createDriverFixture("driver-interrupt-followup", t);
  const firstStarted = deferred<void>();
  const firstAbortObserved = deferred<void>();
  const releaseFirstCleanup = deferred<void>();
  const secondCompleted = deferred<void>();
  const executionOrder: string[] = [];
  const driver = fixture.createDriver(async (options) => {
    executionOrder.push(options.input);
    if (options.input === "first") {
      firstStarted.resolve();
      await waitForAbort(options.abortSignal);
      firstAbortObserved.resolve();
      await releaseFirstCleanup.promise;
      throw createAbortError("first interrupted");
    }
    secondCompleted.resolve();
    return completed(options.session);
  });

  const running = driver.run();
  fixture.controller.submitInput("first");
  await firstStarted.promise;
  fixture.controller.interrupt();
  await firstAbortObserved.promise;
  fixture.controller.submitInput("second");

  await waitUntil(() => readTurns(fixture.root, fixture.session.id).length === 2);
  assert.deepEqual(readTurns(fixture.root, fixture.session.id).map((turn) => turn.status), ["running", "queued"]);
  assert.equal(readSteers(fixture.root, fixture.session.id).length, 0);

  releaseFirstCleanup.resolve();
  await secondCompleted.promise;
  await waitUntil(() => readTurns(fixture.root, fixture.session.id).every(
    (turn) => turn.status === "aborted" || turn.status === "completed",
  ));
  fixture.controller.closeInput();
  await running;

  assert.deepEqual(executionOrder, ["first", "second"]);
  assert.deepEqual(readTurns(fixture.root, fixture.session.id).map((turn) => turn.status), ["aborted", "completed"]);
});

test("terminal close detaches active work for recovery instead of treating it as Ctrl+C", async (t) => {
  const fixture = await createDriverFixture("driver-close-recovery", t);
  const started = deferred<void>();
  const firstDriver = fixture.createDriver(async (options) => {
    started.resolve();
    await waitForAbort(options.abortSignal);
    throw createAbortError("terminal closed");
  });

  const firstRun = firstDriver.run();
  fixture.controller.submitInput("active");
  await started.promise;
  fixture.controller.submitInput("survive terminal close");
  await waitUntil(() => readSteers(fixture.root, fixture.session.id).length === 1);
  fixture.controller.closeInput();
  await firstRun;

  assert.deepEqual(readTurns(fixture.root, fixture.session.id).map((turn) => turn.status), ["queued"]);
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["pending"]);

  const secondController = new TuiController(await fixture.sessionStore.load(fixture.session.id));
  const resumed = deferred<void>();
  const secondDriver = new InteractiveSessionDriver({
    cwd: fixture.root,
    stateRootDir: fixture.root,
    config: fixture.config,
    session: await fixture.sessionStore.load(fixture.session.id),
    sessionStore: fixture.sessionStore,
    shell: createTuiInteractionShell(secondController),
    runTurn: async (options) => {
      const steered = await options.steering!.consumePending(options.session);
      assert.deepEqual(steered.inputs, ["survive terminal close"]);
      resumed.resolve();
      return completed(steered.session);
    },
  });
  const secondRun = secondDriver.run();
  await resumed.promise;
  await waitUntil(() => readTurns(fixture.root, fixture.session.id)[0]?.status === "completed");
  secondController.closeInput();
  await secondRun;
  assert.deepEqual(readSteers(fixture.root, fixture.session.id).map((steer) => steer.status), ["consumed"]);
});

async function createDriverFixture(name: string, t: Parameters<typeof createTempWorkspace>[1]) {
  const root = await createTempWorkspace(name, t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const controller = new TuiController(session);
  return {
    root,
    config,
    sessionStore,
    session,
    controller,
    createDriver(runTurn: (options: RunTurnOptions) => Promise<ReturnType<typeof completed>>) {
      return new InteractiveSessionDriver({
        cwd: root,
        stateRootDir: root,
        config,
        session,
        sessionStore,
        shell: createTuiInteractionShell(controller),
        localCommandHandler: async () => "continue",
        runTurn,
      });
    },
  };
}

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

function readSteers(root: string, sessionId: string) {
  const ledger = new ControlPlaneLedger(root);
  try {
    return ledger.turns.listBySession(sessionId).flatMap((turn) => ledger.turnSteers.listByTurn(turn.id));
  } finally {
    ledger.close();
  }
}

async function waitForAbort(signal: AbortSignal | undefined): Promise<void> {
  if (signal?.aborted) return;
  await new Promise<void>((resolve) => signal?.addEventListener("abort", () => resolve(), { once: true }));
}

async function waitUntil(predicate: () => boolean, timeoutMs = 3_000): Promise<void> {
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
