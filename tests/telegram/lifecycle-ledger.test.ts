import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createSessionRecord } from "../../src/session/store.js";
import { TelegramDeliveryQueue } from "../../src/telegram/deliveryQueue.js";
import { acquireTelegramProcessLock } from "../../src/telegram/processLock.js";
import { createTempWorkspace } from "../helpers.js";

test("telegram service lease has one atomic owner and can be reacquired after release", async (t) => {
  const root = await createTempWorkspace("telegram-service-lease", t);
  const stateDir = path.join(root, ".kitty", "telegram");
  const attempts = await Promise.allSettled([
    acquireTelegramProcessLock({ stateDir, processId: 1001 }),
    acquireTelegramProcessLock({ stateDir, processId: 1002 }),
  ]);
  assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
  assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 1);
  const winner = attempts.find((attempt): attempt is PromiseFulfilledResult<Awaited<ReturnType<typeof acquireTelegramProcessLock>>> =>
    attempt.status === "fulfilled")!.value;
  const firstLedger = new ControlPlaneLedger(root);
  const firstGeneration = firstLedger.serviceLeases.load("telegram")!.generation;
  firstLedger.close();
  await winner.release();
  const replacement = await acquireTelegramProcessLock({ stateDir, processId: 1003 });
  const ledger = new ControlPlaneLedger(root);
  assert.ok(ledger.serviceLeases.load("telegram")!.generation > firstGeneration);
  ledger.close();
  await replacement.release();
});

test("duplicate telegram update binds exactly one durable turn", async (t) => {
  const root = await createTempWorkspace("telegram-update-turn", t);
  const ledger = new ControlPlaneLedger(root);
  const session = ledger.sessions.save(await createSessionRecord(root));
  assert.equal(ledger.telegram.claimInbox(42, "peer-1"), true);
  const first = ledger.telegram.bindTurn({ updateId: 42, sessionId: session.id, text: "do work" });
  assert.equal(ledger.telegram.claimInbox(42, "peer-1"), true);
  const second = ledger.telegram.bindTurn({ updateId: 42, sessionId: session.id, text: "do work again" });
  assert.equal(second, first);
  assert.equal(ledger.turns.listBySession(session.id).length, 1);
  ledger.telegram.markInbox(42, "completed");
  assert.equal(ledger.telegram.claimInbox(42, "peer-1"), false);
  ledger.close();
});

test("telegram outbox exposes uncertain delivery and never blindly retries it", async (t) => {
  const root = await createTempWorkspace("telegram-outbox-uncertain", t);
  let calls = 0;
  const queue = new TelegramDeliveryQueue({
    rootDir: root,
    target: {
      async sendMessage() {
        calls += 1;
        throw new Error("connection ended after request write");
      },
      async sendDocument() {
        throw new Error("not used");
      },
    },
  });
  await queue.enqueue({ chatId: 1, text: "result" });
  await queue.flushDue();
  await queue.flushDue();
  assert.equal(calls, 1);
  assert.equal((await queue.listPending()).length, 1);
  const ledger = new ControlPlaneLedger(root);
  assert.equal(ledger.telegram.listOutbox()[0]?.status, "uncertain");
  ledger.close();
});
