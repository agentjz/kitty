import assert from "node:assert/strict";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { runCommandWithPolicy } from "../../src/utils/commandRunner.js";
import { createTempWorkspace, TEST_EXECUTION_OWNER } from "../helpers.js";

test("command runner records missing commands as failures", async (t) => {
  const root = await createTempWorkspace("command-runner-missing", t);
  const result = await runCommandWithPolicy({
    command: "kitty_missing_command_for_failure_fact --version",
    cwd: root,
    timeoutMs: 10_000,
    stallTimeoutMs: 5_000,
  });

  assert.notEqual(result.exitCode, 0);
  assert.match(result.output, /kitty_missing_command_for_failure_fact|not found|not recognized|无法将/);
  assert.doesNotMatch(result.output, /#< CLIXML|<Objs\b/);
});

test("short-lived foreground commands never persist a pid without creation identity", async (t) => {
  const root = await createTempWorkspace("command-runner-short-lived", t);
  const result = await runCommandWithPolicy({
    command: "node -e \"process.exit(1)\"",
    cwd: root,
    timeoutMs: 10_000,
    stallTimeoutMs: 5_000,
    execution: {
      stateRootDir: root,
      requestedBy: "test",
      ...TEST_EXECUTION_OWNER,
    },
  });
  const ledger = new ControlPlaneLedger(root);
  const executions = ledger.executions.list({ ownerSessionId: TEST_EXECUTION_OWNER.ownerSessionId });
  ledger.close();

  assert.notEqual(result.exitCode, 0);
  assert.equal(executions.length, 1);
  assert.equal(executions[0]?.status, "failed");
  assert.equal(typeof executions[0]?.pid === "number", Boolean(executions[0]?.processIdentity));
});

