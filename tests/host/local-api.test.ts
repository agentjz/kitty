import assert from "node:assert/strict";
import test from "node:test";

import { createLocalAgentApi } from "../../src/host/localApi.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("local agent api creates sessions and reads events/status", async (t) => {
  const root = await createTempWorkspace("local-api", t);
  const api = createLocalAgentApi();

  const session = await api.createSession(root);
  const events = await api.listEvents({ cwd: root, sessionId: session.id });
  const status = await api.readStatus(root);

  assert.equal(events[0]?.type, "session.created");
  assert.equal(status.sessions.latest?.id, session.id);
});

test("local agent api sends a message through host turn", async (t) => {
  const root = await createTempWorkspace("local-api-turn", t);
  const api = createLocalAgentApi({
    runTurn: async (options) => ({
      session: await options.sessionStore.save({
        ...options.session,
        messages: [
          ...options.session.messages,
          {
            role: "user",
            content: options.input,
            createdAt: "2026-06-12T00:00:00.000Z",
          },
          {
            role: "assistant",
            content: "ok",
            createdAt: "2026-06-12T00:00:01.000Z",
          },
        ],
      }),
      changedPaths: [],
    }),
  });
  const session = await api.createSession(root);
  const config = createTestRuntimeConfig(root);

  const result = await api.sendMessage({
    cwd: root,
    config,
    sessionId: session.id,
    message: "hello",
  });

  assert.equal(result.status, "completed");
  const events = await api.listEvents({ cwd: root, sessionId: session.id });
  assert.equal(events.some((event) => event.type === "turn.started"), true);
  assert.equal(events.some((event) => event.type === "turn.completed"), true);
});

test("local agent api records aborted turn events", async (t) => {
  const root = await createTempWorkspace("local-api-abort", t);
  const api = createLocalAgentApi();
  const session = await api.createSession(root);
  const config = createTestRuntimeConfig(root);
  const controller = new AbortController();
  controller.abort();

  const result = await api.sendMessage({
    cwd: root,
    config,
    sessionId: session.id,
    message: "stop now",
    abortSignal: controller.signal,
  });

  assert.equal(result.status, "aborted");
  const events = await api.listEvents({ cwd: root, sessionId: session.id });
  assert.equal(events.some((event) => event.type === "turn.started"), true);
  assert.equal(events.some((event) => event.type === "turn.aborted"), true);
});
