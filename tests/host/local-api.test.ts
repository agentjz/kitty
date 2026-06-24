import assert from "node:assert/strict";
import test from "node:test";

import { runAgentTurn } from "../../src/agent/turn/run.js";
import type { AssistantResponse } from "../../src/agent/types.js";
import { createLocalAgentApi } from "../../src/host/localApi.js";
import { createHostToolRegistry } from "../../src/host/toolRegistry.js";
import type { RegisteredTool } from "../../src/tools/index.js";
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

test("local agent api records successful tool lifecycle events", async (t) => {
  const root = await createTempWorkspace("local-api-tool-events", t);
  const tool = createEventTestTool("event_success", async () => ({
    ok: true,
    output: "tool ok",
    metadata: {
      changedPaths: ["result.txt"],
    },
  }));
  const api = createLocalAgentApi(createToolEventDependencies(tool, [
    createToolCallResponse("call-success", "event_success", { value: 1 }),
    createFinalResponse("done"),
  ]));
  const session = await api.createSession(root);

  const result = await api.sendMessage({
    cwd: root,
    config: createTestRuntimeConfig(root),
    sessionId: session.id,
    message: "run the success tool",
  });

  assert.equal(result.status, "completed");
  const events = await api.listEvents({ cwd: root, sessionId: session.id, limit: 20 });
  const started = events.find((event) => event.type === "tool.started");
  const completed = events.find((event) => event.type === "tool.completed");

  assert.equal(started?.details?.toolName, "event_success");
  assert.equal(started?.details?.toolCallId, "call-success");
  assert.equal(started?.details?.argumentsPreview, "{\"value\":1}");
  assert.equal(completed?.details?.toolName, "event_success");
  assert.equal(completed?.details?.toolCallId, "call-success");
  assert.equal(completed?.details?.changedPathCount, 1);
  assert.equal(typeof completed?.details?.durationMs, "number");
});

test("local agent api records failed tool lifecycle events", async (t) => {
  const root = await createTempWorkspace("local-api-tool-failure-events", t);
  const tool = createEventTestTool("event_failure", async () => ({
    ok: false,
    output: JSON.stringify({
      ok: false,
      code: "EVENT_FAILURE",
      error: "planned failure",
    }),
  }));
  const api = createLocalAgentApi(createToolEventDependencies(tool, [
    createToolCallResponse("call-failure", "event_failure", { value: 2 }),
    createFinalResponse("failure recorded"),
  ]));
  const session = await api.createSession(root);

  const result = await api.sendMessage({
    cwd: root,
    config: createTestRuntimeConfig(root),
    sessionId: session.id,
    message: "run the failure tool",
  });

  assert.equal(result.status, "completed");
  const events = await api.listEvents({ cwd: root, sessionId: session.id, limit: 20 });
  const failed = events.find((event) => event.type === "tool.failed");

  assert.equal(failed?.details?.toolName, "event_failure");
  assert.equal(failed?.details?.toolCallId, "call-failure");
  assert.equal(failed?.details?.error, "EVENT_FAILURE: planned failure");
  assert.equal(failed?.details?.changedPathCount, 0);
});

function createToolEventDependencies(
  tool: RegisteredTool,
  responses: AssistantResponse[],
): Parameters<typeof createLocalAgentApi>[0] {
  let responseIndex = 0;
  return {
    async createToolRegistry(config, options) {
      return createHostToolRegistry(config, {
        ...options,
        builtinToolFilter: () => false,
        extraTools: [tool],
      });
    },
    async runTurn(options) {
      return runAgentTurn({
        ...options,
        fetchAssistantResponse: async () => responses[responseIndex++] ?? createFinalResponse("done"),
        fetchSessionTitleResponse: async () => createFinalResponse("tool events"),
        fetchSessionMemoryResponse: async () => createFinalResponse("Tool event test completed."),
      });
    },
  };
}

function createEventTestTool(
  name: string,
  execute: RegisteredTool["execute"],
): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description: `${name} test tool`,
        parameters: {
          type: "object",
          properties: {
            value: {
              type: "number",
            },
          },
          required: ["value"],
          additionalProperties: false,
        },
      },
    },
    execute,
  };
}

function createToolCallResponse(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
): AssistantResponse {
  return {
    content: null,
    toolCalls: [{
      id,
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    }],
  };
}

function createFinalResponse(content: string): AssistantResponse {
  return {
    content,
    toolCalls: [],
  };
}
