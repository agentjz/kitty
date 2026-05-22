import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_WORKER_EXECUTION_KINDS } from "../../src/execution/kinds.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createTempWorkspace } from "../helpers.js";

test("execution store tracks background, subagent, and teammate as one lifecycle family", async (t) => {
  const root = await createTempWorkspace("execution-family", t);
  const store = new ExecutionStore(root);

  const background = store.create({
    kind: "background",
    command: "npm test",
    cwd: root,
    requestedBy: "lead",
  });
  const subagent = store.create({
    kind: "subagent",
    prompt: "inspect provider code",
    cwd: root,
    requestedBy: "lead",
    actorName: "explorer-provider",
    actorRole: "explorer",
  });
  const teammate = store.create({
    kind: "team",
    prompt: "implement config change",
    cwd: root,
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "implementer",
  });

  store.markRunning(background.id, { pid: 111 });
  store.markRunning(subagent.id, { pid: 222, sessionId: "sub-session" });
  store.markRunning(teammate.id, { pid: 333, sessionId: "team-session" });
  store.close(subagent.id, {
    status: "completed",
    summary: "survey complete",
    resultText: "Provider code inspected.",
  });

  assert.equal(store.load(background.id)?.kind, "background");
  assert.equal(store.load(subagent.id)?.status, "completed");
  assert.equal(store.load(subagent.id)?.sessionId, "sub-session");
  assert.equal(store.load(teammate.id)?.kind, "team");
  assert.equal(store.list({ kinds: AGENT_WORKER_EXECUTION_KINDS }).length, 2);
  assert.equal(store.listWakeSignals().some((signal) => signal.executionId === subagent.id), true);
});
