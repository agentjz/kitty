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
    prompt: "Read src/provider and summarize the config path.",
    role: "explorer",
  }), context);
  const payload = parseToolJson(result.output);
  const execution = new ExecutionStore(root).load(String(payload.id));

  assert.equal(result.ok, true);
  assert.equal(payload.status, "running");
  assert.equal(execution?.kind, "subagent");
  assert.equal(execution?.actorRole, "explorer");
  assert.equal(execution?.requestedBy, "lead");
});
