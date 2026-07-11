import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { appendObservabilityEvent } from "../../src/observability/writer.js";
import { createTempWorkspace } from "../helpers.js";

test("observability writes structured SQLite runtime events", async (t) => {
  const root = await createTempWorkspace("observability", t);
  await appendObservabilityEvent(root, {
    event: "host.turn",
    status: "started",
    sessionId: "session-1",
    turnId: "turn-1",
    details: { host: "test" },
  });
  const ledger = new ControlPlaneLedger(root);
  try {
    const [record] = ledger.runtimeEvents.list();
    assert.equal(record?.event, "host.turn");
    assert.equal(record?.turnId, "turn-1");
  } finally {
    ledger.close();
  }
});

test("observability persists provider correlation and usage details", async (t) => {
  const root = await createTempWorkspace("observability-usage", t);
  await appendObservabilityEvent(root, {
    event: "model.request",
    status: "completed",
    model: "gpt-5.5",
    requestId: "request-1",
    attemptId: "request-1:1",
    details: {
      provider: "openai",
      usageAvailable: true,
      usage: { inputTokens: 100, cacheReadTokens: 80 },
    },
  });
  const ledger = new ControlPlaneLedger(root);
  try {
    const [record] = ledger.runtimeEvents.list();
    assert.equal(record?.requestId, "request-1");
    assert.equal(record?.attemptId, "request-1:1");
    assert.deepEqual(record?.details?.usage, { inputTokens: 100, cacheReadTokens: 80 });
  } finally {
    ledger.close();
  }
});
