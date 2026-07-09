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

  assert.deepEqual(names, ["subagent_cancel", "subagent_check", "subagent_launch", "subagent_read"]);

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

test("subagent read returns output and cancel closes with wake facts", async (t) => {
  const root = await createTempWorkspace("subagent-tools-read-cancel", t);
  const store = new ExecutionStore(root);
  const completed = store.create({
    kind: "subagent",
    prompt: "inspect",
    cwd: root,
    requestedBy: "lead",
    actorName: "reader",
    actorRole: "explorer",
    assignment: {
      objective: "Inspect files",
      expectedOutput: "Summary",
    },
  });
  store.close(completed.id, {
    status: "completed",
    resultText: "alpha\nbeta\ngamma\n",
    summary: "gamma",
  });
  const running = store.create({
    kind: "subagent",
    prompt: "long task",
    cwd: root,
    requestedBy: "lead",
    actorName: "worker",
    actorRole: "explorer",
  });
  store.markRunning(running.id, { pid: process.pid });

  const tools = createSubagentTools();
  const context = createToolContext(root);
  const read = tools.find((tool) => tool.definition.function.name === "subagent_read");
  const cancel = tools.find((tool) => tool.definition.function.name === "subagent_cancel");
  assert.ok(read);
  assert.ok(cancel);

  const readPayload = parseToolJson((await read.execute(JSON.stringify({
    id: completed.id,
    mode: "tail",
    lines: 2,
  }), context)).output);
  const cancelPayload = parseToolJson((await cancel.execute(JSON.stringify({
    id: running.id,
  }), context)).output);
  const cancelledExecution = cancelPayload.execution as Record<string, unknown>;

  assert.equal(readPayload.output, "beta\ngamma");
  assert.equal(cancelledExecution.status, "aborted");
  assert.equal(store.load(running.id)?.status, "aborted");
  assert.equal(store.listWakeSignals().some((signal) => signal.executionId === running.id && signal.reason === "aborted"), true);
});
