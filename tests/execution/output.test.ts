import assert from "node:assert/strict";
import test from "node:test";

import { ExecutionLifecycleError } from "../../src/execution/errors.js";
import { readExecutionOutput } from "../../src/execution/output.js";
import { ExecutionStore } from "../../src/execution/store.js";
import { createTempWorkspace } from "../helpers.js";

test("execution output reader is the shared contract for summary, tail, full, and kind checks", async (t) => {
  const root = await createTempWorkspace("execution-output-reader", t);
  const store = new ExecutionStore(root);
  const execution = store.create({
    kind: "background",
    command: "echo output",
    cwd: root,
    requestedBy: "lead",
  });
  store.close(execution.id, {
    status: "completed",
    output: "one\ntwo\nthree\nfour\n",
    summary: "four",
  });

  assert.equal(readExecutionOutput({ rootDir: root, id: execution.id, mode: "summary" }).output, "four");
  assert.equal(readExecutionOutput({ rootDir: root, id: execution.id, mode: "tail", lines: 2 }).output, "three\nfour");
  const full = readExecutionOutput({ rootDir: root, id: execution.id, mode: "full", maxChars: 5 });
  assert.equal(full.output, "four\n");
  assert.equal(full.truncated, true);

  assert.throws(
    () => readExecutionOutput({ rootDir: root, id: execution.id, kind: "subagent" }),
    (error: unknown) => error instanceof ExecutionLifecycleError && error.code === "EXECUTION_KIND_MISMATCH",
  );
});
