import assert from "node:assert/strict";
import test from "node:test";

import { runCommandWithPolicy } from "../../src/utils/commandRunner.js";
import { createTempWorkspace } from "../helpers.js";

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

