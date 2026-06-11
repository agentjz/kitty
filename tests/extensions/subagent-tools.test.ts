import assert from "node:assert/strict";
import test from "node:test";

import { ExecutionStore } from "../../src/execution/store.js";
import { createSubagentTools } from "../../src/extensions/tools/subagent/index.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("subagent extension launches a recorded agent execution", async (t) => {
  const root = await createTempWorkspace("subagent-tools", t);
  const previousWorkerMode = process.env.KITTY_TEST_WORKER_MODE;
  process.env.KITTY_TEST_WORKER_MODE = "stub";
  t.after(() => {
    if (previousWorkerMode === undefined) {
      delete process.env.KITTY_TEST_WORKER_MODE;
    } else {
      process.env.KITTY_TEST_WORKER_MODE = previousWorkerMode;
    }
  });
  const tools = createSubagentTools();
  const names = tools.map((tool) => tool.definition.function.name).sort();

  assert.deepEqual(names, ["subagent_check", "subagent_launch"]);

  const context = createToolContext(root);
  const launch = tools.find((tool) => tool.definition.function.name === "subagent_launch");
  assert.ok(launch);

  const result = await launch.execute(JSON.stringify({
    objective: "Inspect provider config.",
    boundary: "Read provider files only.",
    expected_output: "Return config path summary.",
    prompt: "Read src/provider and summarize the config path.",
    role: "explorer",
    timeout_ms: 20_000,
  }), context);
  const payload = parseToolJson(result.output);
  const execution = new ExecutionStore(root).load(String(payload.id));

  assert.equal(result.ok, true);
  assert.equal(payload.status, "running");
  assert.equal(typeof payload.deadlineAt, "string");
  assert.equal(execution?.kind, "subagent");
  assert.equal(execution?.actorRole, "explorer");
  assert.equal(execution?.requestedBy, "lead");
  assert.deepEqual(execution?.assignment, {
    objective: "Inspect provider config.",
    boundary: "Read provider files only.",
    expectedOutput: "Return config path summary.",
  });

  const check = tools.find((tool) => tool.definition.function.name === "subagent_check");
  assert.ok(check);
  const checked = parseToolJson((await check.execute("{}", context)).output);
  assert.equal(checked.total, 1);
  assert.equal((checked.active as Array<Record<string, unknown>>)[0]?.id, payload.id);
  assert.equal(((checked.active as Array<Record<string, unknown>>)[0]?.health as Record<string, unknown>).state, "running");
});
