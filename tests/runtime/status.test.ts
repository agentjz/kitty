import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { formatRuntimeStatusText } from "../../src/cli/commands/runtimeStatusPresenter.js";
import { buildRuntimeStatus } from "../../src/runtime/status.js";
import { SessionStore } from "../../src/session/store.js";
import { SpecStore } from "../../src/spec/store.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("runtime status projects the current project runtime facts", async (t) => {
  const root = await createTempWorkspace("runtime-status", t);
  await initGitRepo(root);
  const sessionStore = new SessionStore(`${root}/.kitty/sessions`);
  const session = await sessionStore.save({
    ...(await sessionStore.create(root)),
    title: "Investigate runtime",
    sessionMemory: {
      version: 1,
      summary: "User wants durable runtime visibility.",
      updatedAt: "2026-05-22T00:00:00.000Z",
    },
  });

  const spec = await new SpecStore(root, { rootDir: root }).create({
    title: "Runtime Status",
    sessionId: session.id,
  });

  const ledger = new ControlPlaneLedger(root);
  try {
    ledger.taskLifecycle.startTurn({
      sessionId: session.id,
      objective: "Inspect runtime visibility",
      reason: "turn_started",
    });
    const execution = ledger.executions.create({
      kind: "subagent",
      status: "running",
      prompt: "Inspect runtime state.",
      assignment: {
        objective: "Inspect runtime visibility",
        boundary: "Read-only runtime facts",
        expectedOutput: "Concise summary",
      },
      cwd: root,
      requestedBy: "lead",
      actorName: "alpha",
      actorRole: "explorer",
      sessionId: session.id,
    });
    ledger.team.upsertMember({
      name: "alpha",
      role: "explorer",
      status: "working",
      executionId: execution.id,
      sessionId: session.id,
    });
    ledger.wakeSignals.publish({
      executionId: execution.id,
      reason: "completed",
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(root);

  assert.equal(status.rootDir, root);
  assert.equal(status.sessions.total, 1);
  assert.equal(status.sessions.latest?.id, session.id);
  assert.equal(status.memory.sessions.length, 1);
  assert.equal(status.memory.sessions[0]?.sessionId, session.id);
  assert.equal(status.taskLifecycle?.stage, "normal_work");
  assert.equal(status.taskLifecycle?.objective, "Inspect runtime visibility");
  assert.equal(status.executions.total, 1);
  assert.equal(status.executions.active.length, 1);
  assert.equal(status.executions.active[0]?.assignment?.objective, "Inspect runtime visibility");
  assert.equal(status.executions.active[0]?.health?.state, "running");
  assert.equal(status.team.members[0]?.name, "alpha");
  assert.equal(status.wakeSignals.recent.length, 1);
  assert.equal(status.specs.total, 1);
  assert.equal(status.specs.active[0]?.id, spec.id);

  const text = formatRuntimeStatusText(status);
  assert.match(text, /Now:/);
  assert.match(text, /Objective: Inspect runtime visibility/);
  assert.match(text, /Executions: 1 active \/ 1 total/);
  assert.match(text, /Task lifecycle:/);
});

test("runtime status presents stale working team members as idle when execution is terminal", async (t) => {
  const root = await createTempWorkspace("runtime-status-team-reconcile", t);
  const ledger = new ControlPlaneLedger(root);
  try {
    const execution = ledger.executions.create({
      kind: "team",
      status: "running",
      prompt: "Review runtime state.",
      cwd: root,
      requestedBy: "lead",
      actorName: "reviewer",
      actorRole: "reviewer",
    });
    ledger.team.upsertMember({
      name: "reviewer",
      role: "reviewer",
      status: "working",
      executionId: execution.id,
    });
    ledger.executions.close(execution.id, {
      status: "completed",
      summary: "done",
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(root);

  assert.equal(status.team.members[0]?.name, "reviewer");
  assert.equal(status.team.members[0]?.status, "idle");
});

test("runtime status exposes background executions that are running without output", async (t) => {
  const root = await createTempWorkspace("runtime-status-background-health", t);
  const ledger = new ControlPlaneLedger(root);
  try {
    ledger.executions.create({
      kind: "background",
      status: "running",
      command: "long task",
      cwd: root,
      requestedBy: "lead",
      pid: process.pid,
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(root);

  assert.equal(status.executions.active.length, 1);
  assert.equal(status.executions.active[0]?.health?.state, "no_output");
  assert.match(status.executions.active[0]?.health?.message ?? "", /has not published output/);
});
