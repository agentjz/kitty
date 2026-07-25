import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { runAgentTurn } from "../../src/agent/turn/run.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { createBackgroundTools } from "../../src/capabilities/tools/background/index.js";
import { createTurnScopedSessionStore } from "../../src/host/turnSessionStore.js";
import { SessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import type { ToolCallRecord } from "../../src/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("one agent turn observes background progress and settlement before finalizing", async (t) => {
  const root = await createTempWorkspace("agent-background-wait", t);
  await fs.writeFile(path.join(root, "background-task.cjs"), [
    'const fs = require("node:fs");',
    'const waitBuffer = new Int32Array(new SharedArrayBuffer(4));',
    'const waitFor = (file) => { while (!fs.existsSync(file)) Atomics.wait(waitBuffer, 0, 0, 10); };',
    'waitFor("release-progress");',
    'process.stdout.write(`${"x".repeat(4_200)}:PROGRESS_SENTINEL\\n`);',
    'waitFor("release-late-progress");',
    'process.stdout.write(`${"y".repeat(300)}:LATE_PROGRESS_SENTINEL\\n`);',
    'waitFor("release-settlement");',
    'process.stdout.write("BACKGROUND_FINAL_SENTINEL\\n");',
  ].join("\n"), "utf8");

  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const ledger = new ControlPlaneLedger(root);
  const admitted = ledger.turns.admit({
    sessionId: session.id,
    input: "run and observe the background task",
    inputSource: "external",
  });
  const claimed = ledger.turns.claim(admitted.id)!;
  ledger.close();
  const scopedSessionStore = createTurnScopedSessionStore(sessionStore, {
    rootDir: root,
    sessionId: session.id,
    turnId: claimed.id,
    ownerToken: claimed.ownerToken!,
    ownerGeneration: claimed.ownerGeneration,
  });
  const registry = createToolRegistry({
    sources: [{ kind: "host", id: "test:background", tools: createBackgroundTools() }],
    onlyNames: ["background_run", "background_wait"],
  });
  let requestCount = 0;
  let executionId = "";

  const result = await runAgentTurn({
    turnId: claimed.id,
    turnOwnerToken: claimed.ownerToken,
    turnOwnerGeneration: claimed.ownerGeneration,
    input: admitted.input,
    cwd: root,
    stateRootDir: root,
    config,
    session,
    sessionStore: scopedSessionStore,
    toolRegistry: registry,
    fetchAssistantResponse: async ({ messages }) => {
      requestCount += 1;
      if (requestCount === 1) {
        return toolResponse("run-call", "background_run", {
          command: "node background-task.cjs",
          cwd: root,
          timeout_ms: 30_000,
        });
      }

      const currentLedger = new ControlPlaneLedger(root);
      try {
        executionId ||= currentLedger.executions.list({ ownerSessionId: session.id })[0]?.id ?? "";
      } finally {
        currentLedger.close();
      }
      assert.ok(executionId);

      if (requestCount === 2) {
        await releaseStage(root, "release-progress");
        return toolResponse("progress-wait-call", "background_wait", {
          id: executionId,
          timeout_ms: 20_000,
        });
      }

      const latest = String(messages.at(-1)?.content ?? "");
      if (requestCount === 3) {
        assert.match(latest, /wait: progress/);
        assert.match(latest, /PROGRESS_SENTINEL/);
        await releaseStage(root, "release-late-progress");
        return toolResponse("late-progress-wait-call", "background_wait", {
          id: executionId,
          timeout_ms: 20_000,
        });
      }

      if (requestCount === 4) {
        assert.match(latest, /wait: progress/);
        assert.match(latest, /LATE_PROGRESS_SENTINEL/);
        await releaseStage(root, "release-settlement");
        return toolResponse("settled-wait-call", "background_wait", {
          id: executionId,
          timeout_ms: 20_000,
        });
      }

      assert.match(latest, /wait: settled/);
      assert.match(latest, /BACKGROUND_FINAL_SENTINEL/);
      return { content: "BACKGROUND_FINAL_SENTINEL observed in one turn.", toolCalls: [] };
    },
    fetchSessionTitleResponse: async () => ({ content: "background wait", toolCalls: [] }),
  });

  assert.equal(requestCount, 5);
  assert.match(String(result.session.messages.at(-1)?.content), /BACKGROUND_FINAL_SENTINEL/);
  const facts = new ControlPlaneLedger(root);
  try {
    const turns = facts.turns.listBySession(session.id);
    const toolCalls = facts.toolCalls.listBySession(session.id);
    const executions = facts.executions.list({ ownerSessionId: session.id });
    assert.equal(turns.length, 1);
    assert.deepEqual(toolCalls.map((call) => call.toolName), [
      "background_run",
      "background_wait",
      "background_wait",
      "background_wait",
    ]);
    assert.ok(toolCalls.every((call) => call.turnId === claimed.id && call.status === "success"));
    assert.equal(executions.length, 1);
    assert.equal(executions[0]?.parentTurnId, claimed.id);
    assert.equal(executions[0]?.status, "completed");
    assert.equal(facts.wakeSignals.list().filter((wake) => wake.executionId === executionId).length, 1);
  } finally {
    facts.close();
  }
});

async function releaseStage(root: string, name: string): Promise<void> {
  await fs.writeFile(path.join(root, name), "released\n", "utf8");
}

function toolResponse(
  id: string,
  name: string,
  args: Record<string, unknown>,
): { content: null; toolCalls: ToolCallRecord[] } {
  return {
    content: null,
    toolCalls: [{
      id,
      type: "function",
      function: { name, arguments: JSON.stringify(args) },
    }],
  };
}
