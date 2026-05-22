import assert from "node:assert/strict";
import test from "node:test";

import { createBackgroundTools } from "../../src/extensions/tools/background/index.js";
import { createToolContext, parseToolJson, createTempWorkspace } from "../helpers.js";

test("background extension exposes run, check, and terminate tools", async (t) => {
  const root = await createTempWorkspace("background-tools", t);
  const tools = createBackgroundTools();
  const names = tools.map((tool) => tool.definition.function.name).sort();

  assert.deepEqual(names, ["background_check", "background_run", "background_terminate"]);

  const context = createToolContext(root);
  const run = tools.find((tool) => tool.definition.function.name === "background_run");
  assert.ok(run);

  const result = await run.execute(JSON.stringify({
    command: "node -e \"console.log('done')\"",
    cwd: root,
    timeout_ms: 20_000,
  }), context);
  const payload = parseToolJson(result.output);

  assert.equal(result.ok, true);
  assert.equal(payload.status, "running");
  assert.equal(typeof payload.id, "string");

  const terminate = tools.find((tool) => tool.definition.function.name === "background_terminate");
  assert.ok(terminate);
  await terminate.execute(JSON.stringify({ id: payload.id }), context);
});
