import assert from "node:assert/strict";
import test from "node:test";

import { BackgroundExecutionStore, waitForRegisteredBackgroundProcess } from "../../src/execution/background.js";
import { formatBackgroundExecution } from "../../src/cli/commands/background.js";
import { createBackgroundTools } from "../../src/extensions/tools/background/index.js";
import { summarizeExecution } from "../../src/runtime/executionSummary.js";
import { createToolContext, parseToolJson, createTempWorkspace } from "../helpers.js";

test("background extension exposes run, check, wait, stop, and terminate tools", async (t) => {
  const root = await createTempWorkspace("background-tools", t);
  const tools = createBackgroundTools();
  const names = tools.map((tool) => tool.definition.function.name).sort();

  assert.deepEqual(names, ["background_check", "background_read", "background_run", "background_stop", "background_terminate", "background_wait"]);

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

test("background read returns summary, tail, and full output from recorded executions", async (t) => {
  const root = await createTempWorkspace("background-tool-read", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    command: "stream",
    cwd: root,
    requestedBy: "lead",
  });
  store.close(job.id, {
    status: "completed",
    exitCode: 0,
    output: "one\ntwo\nthree\nfour\n",
    summary: "four",
  });
  const tools = createBackgroundTools();
  const context = createToolContext(root);
  const read = tools.find((tool) => tool.definition.function.name === "background_read");
  assert.ok(read);

  const summary = parseToolJson((await read.execute(JSON.stringify({
    id: job.id,
    mode: "summary",
  }), context)).output);
  const tail = parseToolJson((await read.execute(JSON.stringify({
    id: job.id,
    mode: "tail",
    lines: 2,
  }), context)).output);
  const full = parseToolJson((await read.execute(JSON.stringify({
    id: job.id,
    mode: "full",
  }), context)).output);

  assert.equal(summary.mode, "summary");
  assert.equal(summary.output, "four");
  assert.equal(tail.mode, "tail");
  assert.equal(tail.output, "three\nfour");
  assert.equal(full.mode, "full");
  assert.equal(full.output, "one\ntwo\nthree\nfour\n");
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
  const job = (checked.recent as Array<Record<string, unknown>>).find((item) => item.id === payload.id);
  assert.equal(checked.total, 1);
  assert.equal(Array.isArray(checked.active), true);
  assert.equal(job?.status, "completed");
  assert.equal((job?.health as Record<string, unknown> | undefined)?.state, "settled");
  assert.match(String(job?.outputPreview), /background-smoke/);
  assert.match(String(job?.summary), /background-smoke/);
});

test("background run records missing commands as failed executions", async (t) => {
  const root = await createTempWorkspace("background-tool-missing", t);
  const tools = createBackgroundTools();
  const context = createToolContext(root);
  const run = tools.find((tool) => tool.definition.function.name === "background_run");
  const check = tools.find((tool) => tool.definition.function.name === "background_check");
  assert.ok(run);
  assert.ok(check);

  const result = await run.execute(JSON.stringify({
    command: "kitty_missing_command_for_background_fact --version",
    cwd: root,
    timeout_ms: 20_000,
  }), context);
  const payload = parseToolJson(result.output);
  await waitForRegisteredBackgroundProcess(String(payload.id), 20_000);

  const checked = parseToolJson((await check.execute("{}", context)).output);
  const job = (checked.recent as Array<Record<string, unknown>>).find((item) => item.id === payload.id);
  assert.equal(payload.command, "kitty_missing_command_for_background_fact --version");
  assert.equal(job?.status, "failed");
  assert.notEqual(job?.exitCode, 0);
  assert.doesNotMatch(String(job?.outputPreview), /#< CLIXML|<Objs\b/);
});

test("background wait returns settled execution facts", async (t) => {
  const root = await createTempWorkspace("background-tool-wait", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    command: "completed command",
    cwd: root,
    requestedBy: "lead",
  });
  store.close(job.id, {
    status: "completed",
    exitCode: 0,
    output: "wait-ok",
    summary: "wait-ok",
  });
  const tools = createBackgroundTools();
  const context = createToolContext(root);
  const wait = tools.find((tool) => tool.definition.function.name === "background_wait");
  assert.ok(wait);

  const waited = parseToolJson((await wait.execute(JSON.stringify({
    id: job.id,
    timeout_ms: 20_000,
  }), context)).output);

  const waitedExecution = readExecutionPayload(waited);
  assert.equal(waitedExecution.status, "completed");
  assert.match(String(waitedExecution.outputPreview), /wait-ok/);
});

test("background stop closes a running execution", async (t) => {
  const root = await createTempWorkspace("background-tool-stop", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    command: "long-running",
    cwd: root,
    requestedBy: "lead",
  });
  store.markRunning(job.id, { pid: process.pid });
  const tools = createBackgroundTools();
  const context = createToolContext(root);
  const stop = tools.find((tool) => tool.definition.function.name === "background_stop");
  assert.ok(stop);

  const stopped = parseToolJson((await stop.execute(JSON.stringify({ id: job.id }), context)).output);

  const stoppedExecution = readExecutionPayload(stopped);
  assert.equal(stoppedExecution.status, "aborted");
  assert.equal(store.load(job.id)?.status, "aborted");
});

test("background CLI format explains risk and next action", async (t) => {
  const root = await createTempWorkspace("background-tool-scene-format", t);
  const store = new BackgroundExecutionStore(root);
  const job = store.create({
    command: "long-running-without-output",
    cwd: root,
    requestedBy: "lead",
  });
  store.markRunning(job.id, { pid: process.pid });

  const formatted = formatBackgroundExecution(summarizeExecution(store.load(job.id)!));

  assert.match(formatted, /risk=watch/);
  assert.match(formatted, /has not published output/);
  assert.match(formatted, /kitty background read/);
  assert.match(formatted, /summary=long-running-without-output/);
});

function readExecutionPayload(payload: Record<string, unknown>): Record<string, unknown> {
  assert.equal(typeof payload.execution, "object");
  assert.notEqual(payload.execution, null);
  return payload.execution as Record<string, unknown>;
}
