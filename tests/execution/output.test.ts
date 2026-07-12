import assert from "node:assert/strict";
import test from "node:test";
import { executionOwnership } from "../../src/control/types.js";

import { readExecutionOutput } from "../../src/execution/output.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

test("execution output reader is the shared contract for summary, tail, full, and kind checks", async (t) => {
  const root = await createTempWorkspace("execution-output-reader", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    ...TEST_EXECUTION_OWNER,
    command: "echo output",
    cwd: root,
    requestedBy: "agent",
  });
  store.close(execution.id, executionOwnership(execution), {
    status: "completed",
    output: "one\ntwo\nthree\nfour\n",
    summary: "four",
  });

  assert.equal(readExecutionOutput({ rootDir: root, id: execution.id, mode: "summary" }).output, "four");
  assert.equal(readExecutionOutput({ rootDir: root, id: execution.id, mode: "tail", lines: 2 }).output, "three\nfour");
  const full = readExecutionOutput({ rootDir: root, id: execution.id, mode: "full", maxChars: 5 });
  assert.equal(full.output, "four\n");
  assert.equal(full.truncated, true);

});
