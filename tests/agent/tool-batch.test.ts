import assert from "node:assert/strict";
import test from "node:test";

import { executeToolBatch } from "../../src/agent/turn/toolBatch.js";
import { ChangeStore } from "../../src/agent/changes/store.js";
import { InProcessSessionStore } from "../../src/session/store.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import type { RegisteredTool } from "../../src/tools/core/types.js";
import { createTestRuntimeConfig, createTempWorkspace } from "../helpers.js";

test("tool batch overlaps consecutive parallel-safe reads", async (t) => {
  const root = await createTempWorkspace("parallel-tool-batch", t);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  let active = 0;
  let peak = 0;
  const tool = (name: string): RegisteredTool => ({
    definition: definition(name),
    effect: "read",
    parallelSafe: true,
    async execute() {
      active += 1;
      peak = Math.max(peak, active);
      await delay(40);
      active -= 1;
      return { ok: true, output: name };
    },
  });
  const registry = createToolRegistry({
    sources: [{ kind: "host", id: "test:parallel", tools: [tool("read_a"), tool("read_b")] }],
    onlyNames: ["read_a", "read_b"],
  });

  const result = await executeToolBatch({
    session,
    toolCalls: [call("a", "read_a"), call("b", "read_b")],
    toolRegistry: registry,
    options: options(root, session, sessionStore),
    projectContext: projectContext(root),
    changeStore: new ChangeStore(createTestRuntimeConfig(root).paths.changesDir),
  });

  assert.equal(peak, 2);
  assert.deepEqual(result.items.map((item) => item.toolCall.function.name), ["read_a", "read_b"]);
});

test("tool batch preserves order for tools with side effects", async (t) => {
  const root = await createTempWorkspace("ordered-tool-batch", t);
  const sessionStore = new InProcessSessionStore();
  const session = await sessionStore.create(root);
  const order: string[] = [];
  const tool = (name: string): RegisteredTool => ({
    definition: definition(name),
    effect: "write",
    async execute() {
      order.push(`${name}:start`);
      await delay(name === "write_a" ? 30 : 1);
      order.push(`${name}:end`);
      return { ok: true, output: name };
    },
  });
  const registry = createToolRegistry({
    sources: [{ kind: "host", id: "test:ordered", tools: [tool("write_a"), tool("write_b")] }],
    onlyNames: ["write_a", "write_b"],
  });

  await executeToolBatch({
    session,
    toolCalls: [call("a", "write_a"), call("b", "write_b")],
    toolRegistry: registry,
    options: options(root, session, sessionStore),
    projectContext: projectContext(root),
    changeStore: new ChangeStore(createTestRuntimeConfig(root).paths.changesDir),
  });

  assert.deepEqual(order, ["write_a:start", "write_a:end", "write_b:start", "write_b:end"]);
});

function definition(name: string): RegisteredTool["definition"] {
  return {
    type: "function",
    function: {
      name,
      description: name,
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  };
}

function call(id: string, name: string) {
  return { id, type: "function" as const, function: { name, arguments: "{}" } };
}

function options(root: string, session: Awaited<ReturnType<InProcessSessionStore["create"]>>, sessionStore: InProcessSessionStore) {
  return {
    input: "test",
    cwd: root,
    config: createTestRuntimeConfig(root),
    session,
    sessionStore,
  };
}

function projectContext(root: string) {
  return {
    rootDir: root,
    stateRootDir: root,
    cwd: root,
    instructions: [],
    instructionText: "",
    instructionTruncated: false,
    ignoreRules: [],
    skills: [],
  };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
