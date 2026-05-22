import assert from "node:assert/strict";
import test from "node:test";

import { TeamStore } from "../../src/team/store.js";
import { createTeamTools } from "../../src/extensions/tools/team/index.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("team extension records teammates, messages, inbox reads, and teammate executions", async (t) => {
  const root = await createTempWorkspace("team-tools", t);
  const previousWorkerMode = process.env.KITTY_TEST_WORKER_MODE;
  process.env.KITTY_TEST_WORKER_MODE = "stub";
  t.after(() => {
    if (previousWorkerMode === undefined) {
      delete process.env.KITTY_TEST_WORKER_MODE;
    } else {
      process.env.KITTY_TEST_WORKER_MODE = previousWorkerMode;
    }
  });
  const tools = createTeamTools();
  const names = tools.map((tool) => tool.definition.function.name).sort();

  assert.deepEqual(names, ["team_inbox_read", "team_list", "team_message_send", "team_spawn"]);

  const context = createToolContext(root);
  const spawn = tools.find((tool) => tool.definition.function.name === "team_spawn");
  const send = tools.find((tool) => tool.definition.function.name === "team_message_send");
  const readInbox = tools.find((tool) => tool.definition.function.name === "team_inbox_read");
  assert.ok(spawn);
  assert.ok(send);
  assert.ok(readInbox);

  const spawned = parseToolJson((await spawn.execute(JSON.stringify({
    name: "alpha",
    role: "implementer",
    objective: "Implement config change.",
    boundary: "Only inspect src/config.",
    expected_output: "Return changed paths.",
    prompt: "Implement the config change.",
  }), context)).output);
  await send.execute(JSON.stringify({
    to: "alpha",
    message: "Please inspect src/config.",
  }), context);
  const inbox = parseToolJson((await readInbox.execute(JSON.stringify({ name: "alpha" }), context)).output);
  const member = new TeamStore(root).findMember("alpha");

  assert.equal(typeof spawned.executionId, "string");
  assert.equal(member?.status, "working");
  assert.equal(member?.role, "implementer");
  assert.deepEqual(spawned.assignment, {
    objective: "Implement config change.",
    boundary: "Only inspect src/config.",
    expectedOutput: "Return changed paths.",
  });
  assert.equal(Array.isArray(inbox.messages), true);
  assert.equal((inbox.messages as unknown[]).length, 1);
});
