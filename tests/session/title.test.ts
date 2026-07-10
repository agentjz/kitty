import assert from "node:assert/strict";
import test from "node:test";

import {
  applyModelSessionTitle,
  normalizeModelSessionTitle,
} from "../../src/session/title.js";
import { InProcessSessionStore } from "../../src/session/store.js";

test("session title normalizes concise model text", () => {
  assert.equal(normalizeModelSessionTitle("## \"读取包名\"。"), "读取包名");
});

test("session title rejects tool protocol text", () => {
  assert.equal(
    normalizeModelSessionTitle("<｜DSML｜tool_calls> <｜DSML｜invoke name=\"read\">"),
    undefined,
  );
  assert.equal(
    normalizeModelSessionTitle("{\"tool_calls\":[{\"function\":{\"name\":\"read\"}}]}"),
    undefined,
  );
});

test("invalid model session title does not overwrite the session", async () => {
  const session = await new InProcessSessionStore().create("C:\\repo");
  assert.equal(
    applyModelSessionTitle(session, "<tool_call>{\"name\":\"read\"}</tool_call>").title,
    undefined,
  );
});
