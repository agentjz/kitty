import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_WORKER_EXECUTION_KINDS } from "../../src/execution/kinds.js";
import { runExecutionWorker } from "../../src/execution/worker.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { TeamStore } from "../../src/team/store.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";
import type { StoredMessage } from "../../src/types.js";

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
  assert.equal(store.load(background.id)?.waitPolicy?.lead, "none");
  assert.equal(store.load(subagent.id)?.status, "completed");
  assert.equal(store.load(subagent.id)?.waitPolicy?.lead, "while_execution_active");
  assert.equal(store.load(subagent.id)?.sessionId, "sub-session");
  assert.equal(store.load(teammate.id)?.kind, "team");
  assert.equal(store.load(teammate.id)?.waitPolicy?.lead, "while_execution_active");
  assert.equal(store.list({ kinds: AGENT_WORKER_EXECUTION_KINDS }).length, 2);
  assert.equal(store.listWakeSignals().some((signal) => signal.executionId === subagent.id), true);
});

test("team worker completion returns teammate to idle", async (t) => {
  const root = await createTempWorkspace("team-worker-idle", t);
  const config = createTestRuntimeConfig(root);
  const store = new ExecutionStore(root);
  const team = new TeamStore(root);
  const execution = store.create({
    kind: "team",
    prompt: "finish work",
    cwd: root,
    requestedBy: "lead",
    actorName: "alpha",
    actorRole: "reviewer",
  });
  team.upsertMember({
    name: "alpha",
    role: "reviewer",
    status: "working",
    executionId: execution.id,
  });

  await runExecutionWorker({
    rootDir: root,
    cwd: root,
    config,
    executionId: execution.id,
    runTurn: async (options) => ({
      status: "completed",
      session: options.session,
      result: {
        session: options.session,
        changedPaths: [],
        transition: {
          action: "finalize",
          reason: {
            code: "finalize.completed",
            changedPaths: [],
          },
          timestamp: new Date().toISOString(),
        },
      },
    }),
  });

  assert.equal(store.load(execution.id)?.status, "completed");
  assert.equal(team.findMember("alpha")?.status, "idle");
});

test("agent worker completion records the worker final answer for lead wake", async (t) => {
  const root = await createTempWorkspace("agent-worker-result", t);
  const config = createTestRuntimeConfig(root);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "inspect context code",
    cwd: root,
    requestedBy: "lead",
    actorName: "explorer",
    actorRole: "explorer",
  });

  await runExecutionWorker({
    rootDir: root,
    cwd: root,
    config,
    executionId: execution.id,
    runTurn: async (options) => {
      const assistantMessage: StoredMessage = {
        role: "assistant",
        content: "Context code uses session memory and working memory correctly.",
        createdAt: "2026-05-22T00:00:00.000Z",
      };
      const session = {
        ...options.session,
        messages: [
          ...options.session.messages,
          assistantMessage,
        ],
      };
      return {
        status: "completed",
        session,
        result: {
          session,
          changedPaths: [],
          transition: {
            action: "finalize",
            reason: {
              code: "finalize.completed",
              changedPaths: [],
            },
            timestamp: new Date().toISOString(),
          },
        },
      };
    },
  });

  const closed = store.load(execution.id);
  assert.equal(closed?.status, "completed");
  assert.equal(closed?.summary, "Context code uses session memory and working memory correctly.");
  assert.equal(closed?.output, "Context code uses session memory and working memory correctly.");
});
