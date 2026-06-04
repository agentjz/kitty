import assert from "node:assert/strict";
import test from "node:test";

import { runAgentTurn } from "../../src/agent/turn/run.js";
import { runHostTurn } from "../../src/host/turn.js";
import { InProcessSessionStore } from "../../src/session/store.js";
import { readUserInput } from "../../src/session/turnFrame.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { buildLeadWakeFacts, hasUnsettledLeadWaitExecutions, pauseExpiredLeadWaitExecutions } from "../../src/execution/leadWait.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";
import type { AssistantResponse } from "../../src/agent/types.js";
import type { RegisteredTool } from "../../src/tools/core/types.js";

test("lead turn yields immediately after a lead-wait execution is created", async (t) => {
  const root = await createTempWorkspace("lead-yield-turn", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const store = new ExecutionStore(root);
  let executionId = "";

  const result = await runAgentTurn({
    input: "delegate work",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({
      onlyNames: ["delegate_once"],
      sources: [{
        kind: "host",
        id: "test:lead-yield",
        tools: [createDelegatingTool(() => {
          const execution = store.create({
            kind: "subagent",
            prompt: "finish delegated work",
            cwd: root,
            requestedBy: "lead",
            actorName: "worker",
          });
          store.markRunning(execution.id, { pid: process.pid });
          executionId = execution.id;
          return execution.id;
        })],
      }],
    }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "delegating",
      toolCalls: [{
        id: "tool-1",
        type: "function",
        function: {
          name: "delegate_once",
          arguments: "{}",
        },
      }],
    }),
  });

  assert.equal(result.transition?.action, "yield");
  assert.deepEqual(result.transition?.reason.executionIds, [executionId]);
});

test("lead wait is driven by execution wait policy instead of execution kind", async (t) => {
  const root = await createTempWorkspace("lead-yield-policy", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const store = new ExecutionStore(root);
  let executionId = "";

  const result = await runAgentTurn({
    input: "start nonblocking and blocking work",
    cwd: root,
    config,
    session,
    sessionStore,
    toolRegistry: createToolRegistry({
      onlyNames: ["create_policy_executions"],
      sources: [{
        kind: "host",
        id: "test:lead-yield-policy",
        tools: [createDelegatingTool(() => {
          store.create({
            kind: "subagent",
            prompt: "nonblocking by policy",
            cwd: root,
            requestedBy: "lead",
            actorName: "nonblocking",
            waitPolicy: {
              lead: "none",
              wake: "optional",
              scope: "objective",
            },
          });
          const blocking = store.create({
            kind: "background",
            command: "blocking by policy",
            cwd: root,
            requestedBy: "lead",
            waitPolicy: {
              lead: "while_execution_active",
              wake: "required",
              scope: "global",
            },
          });
          store.markRunning(blocking.id, { pid: process.pid });
          executionId = blocking.id;
          return blocking.id;
        }, "create_policy_executions")],
      }],
    }),
    fetchAssistantResponse: async (): Promise<AssistantResponse> => ({
      content: "creating executions",
      toolCalls: [{
        id: "tool-1",
        type: "function",
        function: {
          name: "create_policy_executions",
          arguments: "{}",
        },
      }],
    }),
  });

  assert.equal(result.transition?.action, "yield");
  assert.deepEqual(result.transition?.reason.executionIds, [executionId]);
});

test("host waits for yielded execution and resumes lead with wake facts", async (t) => {
  const root = await createTempWorkspace("lead-wait-host", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "finish delegated work",
    cwd: root,
    requestedBy: "lead",
    actorName: "worker",
  });
  store.markRunning(execution.id, { pid: process.pid });
  let calls = 0;

  const outcome = await runHostTurn({
    host: "test",
    input: "delegate work",
    cwd: root,
    config,
    session,
    sessionStore,
  }, {
    createToolRegistry: async () => createToolRegistry({ onlyNames: [] }),
    runTurn: async (options) => {
      calls += 1;
      if (calls === 1) {
        queueMicrotask(() => {
          store.close(execution.id, {
            status: "completed",
            summary: "delegated work completed",
            resultText: "done",
          });
        });
        return {
          session: options.session,
          changedPaths: [],
          transition: {
            action: "yield",
            reason: {
              code: "yield.execution_wait",
              executionIds: [execution.id],
              toolNames: ["subagent_launch"],
            },
            timestamp: new Date().toISOString(),
          },
        };
      }

      assert.equal(readUserInput(options.input), undefined);
      assert.match(options.runtimePromptState?.internalFactBlocks?.join("\n") ?? "", /delegated executions settled/);
      assert.match(options.runtimePromptState?.internalFactBlocks?.join("\n") ?? "", new RegExp(execution.id));
      assert.match(options.runtimePromptState?.internalFactBlocks?.join("\n") ?? "", /completed/);
      return {
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
      };
    },
  });

  assert.equal(outcome.status, "completed");
  assert.equal(calls, 2);
});

test("lead wait settlement follows the execution wait policy terminal statuses", async (t) => {
  const root = await createTempWorkspace("lead-wait-terminal-policy", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "delegated work",
    cwd: root,
    requestedBy: "lead",
    waitPolicy: {
      lead: "while_execution_active",
      wake: "required",
      terminalStatuses: ["paused"],
    },
  });
  store.markRunning(execution.id, { pid: process.pid });

  assert.equal(hasUnsettledLeadWaitExecutions(root, [execution.id]), true);
  store.close(execution.id, {
    status: "paused",
    summary: "paused by lifecycle",
  });

  assert.equal(hasUnsettledLeadWaitExecutions(root, [execution.id]), false);
});

test("lead wake facts include assignment boundaries and worker output for synthesis", async (t) => {
  const root = await createTempWorkspace("lead-wake-assignment-facts", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "inspect context code",
    assignment: {
      objective: "Inspect context runtime",
      boundary: "Read-only source review",
      expectedOutput: "List the lifecycle risks",
    },
    cwd: root,
    requestedBy: "lead",
    actorName: "explorer",
  });
  const closed = store.close(execution.id, {
    status: "completed",
    summary: "context lifecycle reviewed",
    output: "Risk: wake facts must stay internal.",
  });

  const facts = buildLeadWakeFacts([closed]).promptBlock;

  assert.match(facts, /objective: Inspect context runtime/);
  assert.match(facts, /boundary: Read-only source review/);
  assert.match(facts, /expected output: List the lifecycle risks/);
  assert.match(facts, /Risk: wake facts must stay internal/);
});

test("lead wait deadline pauses stuck delegated execution", async (t) => {
  const root = await createTempWorkspace("lead-wait-deadline", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "subagent",
    prompt: "stuck work",
    cwd: root,
    requestedBy: "lead",
    actorName: "stuck-worker",
    timeoutMs: 10,
  });
  const running = store.markRunning(execution.id, { pid: process.pid });
  const deadline = Date.parse(running.startedAt ?? running.createdAt) + 11;

  const paused = pauseExpiredLeadWaitExecutions(root, [execution.id], deadline);
  const reloaded = store.load(execution.id);

  assert.equal(paused.length, 1);
  assert.equal(reloaded?.status, "paused");
  assert.equal(hasUnsettledLeadWaitExecutions(root, [execution.id]), false);
  assert.match(reloaded?.summary ?? "", /deadline reached/);
});

function createDelegatingTool(createExecution: () => string, name = "delegate_once"): RegisteredTool {
  return {
    definition: {
      type: "function",
      function: {
        name,
        description: "Create a delegated execution.",
        parameters: {
          type: "object",
          properties: {},
          additionalProperties: false,
        },
      },
    },
    async execute() {
      const executionId = createExecution();
      return {
        ok: true,
        output: JSON.stringify({ executionId }, null, 2),
      };
    },
  };
}
