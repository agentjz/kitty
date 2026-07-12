import assert from "node:assert/strict";
import test from "node:test";

import { runAgentTurn } from "../../src/agent/turn/run.js";
import { consumePendingTurnSteers } from "../../src/agent/turn/steering.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createTurnScopedSessionStore } from "../../src/host/turnSessionStore.js";
import { SessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import type { RegisteredTool } from "../../src/tools/core/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("final output plus a pending steer continues the same turn with ordered history", async (t) => {
  const fixture = await createSteeringFixture("agent-final-steer", t);
  const requests: string[][] = [];
  const completedOutputs: string[] = [];
  let requestCount = 0;

  const result = await runAgentTurn({
    ...fixture.options,
    callbacks: {
      onAssistantDone: (text) => completedOutputs.push(text),
    },
    fetchAssistantResponse: async ({ messages }) => {
      requestCount += 1;
      requests.push(messages.map((message) => String(message.content ?? "")));
      if (requestCount === 1) {
        const ledger = new ControlPlaneLedger(fixture.root);
        try {
          assert.ok(ledger.turnSteers.admit({
            turnId: fixture.turnId,
            sessionId: fixture.sessionId,
            text: "change the answer now",
          }));
        } finally {
          ledger.close();
        }
        return response("initial answer");
      }
      return response("adjusted answer");
    },
    fetchSessionTitleResponse: async () => response("steered task"),
  });

  assert.equal(requestCount, 2);
  assert.deepEqual(completedOutputs, ["initial answer", "adjusted answer"]);
  assert.equal(requests[1]?.includes("initial answer"), true);
  assert.equal(requests[1]?.includes("change the answer now"), true);
  assert.deepEqual(result.session.messages.map((message) => message.content), [
    "start the task",
    "initial answer",
    "change the answer now",
    "adjusted answer",
  ]);
  assert.deepEqual(readSteerStatuses(fixture.root, fixture.turnId), ["consumed"]);
});

test("steer accepted during tool execution enters the next model request without aborting the tool", async (t) => {
  const fixture = await createSteeringFixture("agent-tool-steer", t);
  let toolCompleted = false;
  let requestCount = 0;
  const tool: RegisteredTool = {
    definition: {
      type: "function",
      function: {
        name: "inspect_state",
        description: "Inspect state",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    },
    effect: "read",
    async execute() {
      const ledger = new ControlPlaneLedger(fixture.root);
      try {
        assert.ok(ledger.turnSteers.admit({
          turnId: fixture.turnId,
          sessionId: fixture.sessionId,
          text: "also verify the fallback",
        }));
      } finally {
        ledger.close();
      }
      toolCompleted = true;
      return { ok: true, output: "state is ready" };
    },
  };
  const registry = createToolRegistry({
    sources: [{ kind: "host", id: "test:steering", tools: [tool] }],
    onlyNames: ["inspect_state"],
  });

  const result = await runAgentTurn({
    ...fixture.options,
    toolRegistry: registry,
    fetchAssistantResponse: async ({ messages }) => {
      requestCount += 1;
      if (requestCount === 1) {
        return {
          content: null,
          toolCalls: [{
            id: "inspect-call",
            type: "function",
            function: { name: "inspect_state", arguments: "{}" },
          }],
        };
      }
      assert.equal(toolCompleted, true);
      assert.equal(messages.some((message) => String(message.content ?? "").includes("also verify the fallback")), true);
      return response("verified both paths");
    },
    fetchSessionTitleResponse: async () => response("tool steer"),
  });

  assert.equal(requestCount, 2);
  assert.equal(toolCompleted, true);
  assert.equal(result.session.messages.some((message) => message.content === "also verify the fallback"), true);
  assert.deepEqual(readSteerStatuses(fixture.root, fixture.turnId), ["consumed"]);
});

async function createSteeringFixture(name: string, t: Parameters<typeof createTempWorkspace>[1]) {
  const root = await createTempWorkspace(name, t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const ledger = new ControlPlaneLedger(root);
  const admitted = ledger.turns.admit({ sessionId: session.id, input: "start the task", inputSource: "external" });
  const claimed = ledger.turns.claim(admitted.id)!;
  ledger.close();
  const ownership = {
    rootDir: root,
    sessionId: session.id,
    turnId: claimed.id,
    ownerToken: claimed.ownerToken!,
  };
  const scopedSessionStore = createTurnScopedSessionStore(sessionStore, ownership);
  return {
    root,
    sessionId: session.id,
    turnId: claimed.id,
    ownership,
    options: {
      turnId: claimed.id,
      turnOwnerToken: claimed.ownerToken,
      input: "start the task",
      cwd: root,
      stateRootDir: root,
      config,
      session,
      sessionStore: scopedSessionStore,
      steering: {
        consumePending: async (currentSession: typeof session) => {
          const consumed = await consumePendingTurnSteers({
            rootDir: root,
            turnId: claimed.id,
            ownerToken: claimed.ownerToken!,
            session: currentSession,
            sessionStore: scopedSessionStore,
          });
          return { session: consumed.session, inputs: consumed.steers.map((steer) => steer.input) };
        },
        beginClosing: async () => {
          const closing = new ControlPlaneLedger(root);
          try {
            return closing.turns.beginClosing(claimed.id, claimed.ownerToken!);
          } finally {
            closing.close();
          }
        },
      },
    },
  };
}

function response(content: string) {
  return { content, toolCalls: [] };
}

function readSteerStatuses(root: string, turnId: string) {
  const ledger = new ControlPlaneLedger(root);
  try {
    return ledger.turnSteers.listByTurn(turnId).map((steer) => steer.status);
  } finally {
    ledger.close();
  }
}
