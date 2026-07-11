import assert from "node:assert/strict";
import test from "node:test";

import { AGENT_WORKER_EXECUTION_KINDS } from "../../src/execution/kinds.js";
import { runExecutionWorker } from "../../src/execution/worker.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { SessionEventStore } from "../../src/session/events.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";
import type { StoredMessage } from "../../src/types.js";

test("execution store tracks background and subagent as one lifecycle family", async (t) => {
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
    assignment: {
      objective: "inspect provider",
      boundary: "read-only",
      expectedOutput: "summary",
    },
    cwd: root,
    requestedBy: "lead",
    actorName: "explorer-provider",
    actorRole: "explorer",
  });

  store.markRunning(background.id, { pid: 111 });
  store.markRunning(subagent.id, { pid: 222, sessionId: "sub-session" });
  store.close(subagent.id, {
    status: "completed",
    summary: "survey complete",
    resultText: "Provider code inspected.",
  });

  assert.equal(store.load(background.id)?.kind, "background");
  assert.equal(store.load(background.id)?.waitPolicy?.lead, "none");
  assert.equal(store.load(subagent.id)?.status, "completed");
  assert.deepEqual(store.load(subagent.id)?.assignment, {
    objective: "inspect provider",
    boundary: "read-only",
    expectedOutput: "summary",
  });
  assert.equal(store.load(subagent.id)?.waitPolicy?.lead, "while_execution_active");
  assert.equal(store.load(subagent.id)?.sessionId, "sub-session");
  assert.equal(store.list({ kinds: AGENT_WORKER_EXECUTION_KINDS }).length, 1);
  assert.equal(store.listWakeSignals().some((signal) => signal.executionId === subagent.id), true);
});

test("agent worker records runtime UI events for lead wait replay", async (t) => {
  const root = await createTempWorkspace("agent-worker-runtime-ui", t);
  const config = createTestRuntimeConfig(root);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "inspect files",
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
      options.callbacks?.onToolCall?.("read", JSON.stringify({ path: "src/index.ts" }));
      options.callbacks?.onToolResult?.("read", "export const value = 1;");
      options.callbacks?.onAssistantDelta?.("subagent visible answer");
      const session = {
        ...options.session,
        messages: [
          ...options.session.messages,
          {
            role: "assistant",
            content: "subagent visible answer",
            createdAt: "2026-05-22T00:00:00.000Z",
          } satisfies StoredMessage,
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

  const sessionId = store.load(execution.id)?.sessionId;
  assert.ok(sessionId);
  const events = await new SessionEventStore(config.paths.eventsDir).list(sessionId, 20);
  const runtimeEvents = events
    .filter((event) => event.type === "runtime.ui")
    .map((event) => event.details?.runtimeUiEvent as { channel?: string; kind?: string; toolName?: string; message?: string });

  assert.deepEqual(runtimeEvents.map((event) => event.channel), ["subagent", "subagent", "subagent"]);
  assert.deepEqual(runtimeEvents.map((event) => event.kind), ["tool_call", "tool_result", "assistant_text"]);
  assert.equal(runtimeEvents[0]?.toolName, "read");
  assert.equal(runtimeEvents[2]?.message, "subagent visible answer");
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
        content: "Context code uses durable session facts and working memory correctly.",
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
  assert.equal(closed?.summary, "Context code uses durable session facts and working memory correctly.");
  assert.equal(closed?.output, "Context code uses durable session facts and working memory correctly.");
  assert.deepEqual(closed?.changedPaths, []);
  assert.equal(closed?.closeReason, "completed");
});
