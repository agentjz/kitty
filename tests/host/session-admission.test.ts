import assert from "node:assert/strict";
import test from "node:test";

import { runHostTurn } from "../../src/host/turn.js";
import type { RunTurnOptions } from "../../src/agent/types.js";
import { createMessage } from "../../src/session/messages.js";
import { SessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("concurrent host turns serialize by durable session admission without losing messages", async (t) => {
  const root = await createTempWorkspace("host-session-admission", t);
  const config = createTestRuntimeConfig(root);
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(root));
  const executionOrder: string[] = [];

  const runTurn = async (options: RunTurnOptions) => {
    executionOrder.push(options.input);
    if (options.input === "first") await new Promise((resolve) => setTimeout(resolve, 80));
    const saved = await options.sessionStore.appendMessages(options.session, [
      createMessage("assistant", `${options.input}-done`),
    ]);
    return {
      session: saved,
      changedPaths: [],
      transition: {
        action: "finalize" as const,
        reason: { code: "finalize.completed" as const, changedPaths: [] },
        timestamp: new Date().toISOString(),
      },
    };
  };
  const dependencies = {
    createToolRegistry: async () => createToolRegistry({ onlyNames: [] }),
    runTurn,
  };

  const first = runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "first",
    cwd: root,
    config,
    session,
    sessionStore,
  }, dependencies);
  await new Promise((resolve) => setTimeout(resolve, 10));
  const second = runHostTurn({
    host: "test",
    stateRootDir: root,
    input: "second",
    cwd: root,
    config,
    session,
    sessionStore,
  }, dependencies);

  const outcomes = await Promise.all([first, second]);
  assert.deepEqual(outcomes.map((outcome) => outcome.status), ["completed", "completed"]);
  assert.deepEqual(executionOrder, ["first", "second"]);
  const loaded = await sessionStore.load(session.id);
  assert.deepEqual(loaded.messages.map((message) => message.content), ["first-done", "second-done"]);
});
