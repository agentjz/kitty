import assert from "node:assert/strict";
import test from "node:test";

import { waitForRegisteredBackgroundProcess } from "../../src/execution/background.js";
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

test("background run preserves streamed output after process close", async (t) => {
  const root = await createTempWorkspace("background-tool-output", t);
  const tools = createBackgroundTools();
  const context = createToolContext(root);
  const run = tools.find((tool) => tool.definition.function.name === "background_run");
  const check = tools.find((tool) => tool.definition.function.name === "background_check");
  assert.ok(run);
  assert.ok(check);

  const result = await run.execute(JSON.stringify({
    command: "node -e \"console.log('background-smoke')\"",
    cwd: root,
    timeout_ms: 20_000,
  }), context);
  const payload = parseToolJson(result.output);
  await waitForRegisteredBackgroundProcess(String(payload.id), 20_000);

  const checked = parseToolJson((await check.execute("{}", context)).output);
  const job = (checked.jobs as Array<Record<string, unknown>>).find((item) => item.id === payload.id);
  assert.equal(job?.status, "completed");
  assert.match(String(job?.output), /background-smoke/);
  assert.match(String(job?.summary), /background-smoke/);
});
