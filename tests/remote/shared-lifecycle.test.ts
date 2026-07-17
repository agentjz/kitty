import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { RemoteDeliveryQueue } from "../../src/remote/deliveryQueue.js";
import { runRemoteServiceWithLock } from "../../src/remote/serviceLifecycle.js";
import { createTempWorkspace } from "../helpers.js";

test("telegram and weixin share one host-partitioned durable outbox", async (t) => {
  const root = await createTempWorkspace("remote-outbox", t);
  const delivered: string[] = [];
  const telegram = new RemoteDeliveryQueue({ rootDir: root, host: "telegram", deliver: async (entry) => { delivered.push(`${entry.host}:${entry.payload.text}`); } });
  const weixin = new RemoteDeliveryQueue({ rootDir: root, host: "weixin", deliver: async (entry) => { delivered.push(`${entry.host}:${entry.payload.text}`); } });
  await telegram.enqueue({ recipientKey: "42", kind: "text", payload: { text: "tg" } });
  await weixin.enqueue({ recipientKey: "wxid_owner", kind: "text", payload: { text: "wx" } });
  await Promise.all([telegram.flushDue(), weixin.flushDue()]);
  assert.deepEqual(delivered.sort(), ["telegram:tg", "weixin:wx"]);
  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(ledger.remoteMessages.listOutbox("telegram")[0]?.status, "sent");
    assert.equal(ledger.remoteMessages.listOutbox("weixin")[0]?.status, "sent");
  } finally { ledger.close(); }
});

test("shared remote queue makes an abandoned send uncertain instead of replaying it", async (t) => {
  const root = await createTempWorkspace("remote-uncertain", t);
  const ledger = new ControlPlaneLedger(root);
  try {
    ledger.remoteMessages.enqueue({ host: "weixin", recipientKey: "wxid_owner", kind: "text", payload: { text: "possibly sent" } });
    assert.ok(ledger.remoteMessages.claimNext("weixin"));
  } finally { ledger.close(); }
  let sends = 0;
  const recovered = new RemoteDeliveryQueue({ rootDir: root, host: "weixin", deliver: async () => { sends += 1; } });
  await recovered.flushDue();
  assert.equal(sends, 0);
  const inspect = new ControlPlaneLedger(root);
  try { assert.equal(inspect.remoteMessages.listOutbox("weixin")[0]?.status, "uncertain"); }
  finally { inspect.close(); }
});

test("failed remote inbox entries are terminal while interrupted processing can be reclaimed", async (t) => {
  const root = await createTempWorkspace("remote-inbox-terminal", t);
  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(ledger.remoteMessages.claimInbox({ host: "weixin", messageId: "failed" }), true);
    ledger.remoteMessages.markInbox({ host: "weixin", messageId: "failed", status: "failed", error: "turn failed" });
    assert.equal(ledger.remoteMessages.claimInbox({ host: "weixin", messageId: "failed" }), false);

    assert.equal(ledger.remoteMessages.claimInbox({ host: "telegram", messageId: "processing" }), true);
    assert.equal(ledger.remoteMessages.claimInbox({ host: "telegram", messageId: "processing" }), true);
  } finally {
    ledger.close();
  }
});

test("remote service creation failure still releases its durable lease", async () => {
  let releases = 0;
  await assert.rejects(
    runRemoteServiceWithLock({
      lock: { async release() { releases += 1; } },
      createService: async () => { throw new Error("service construction failed"); },
    }),
    /service construction failed/u,
  );
  assert.equal(releases, 1);
});
