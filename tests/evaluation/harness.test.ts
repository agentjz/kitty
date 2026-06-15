import assert from "node:assert/strict";
import test from "node:test";

import { listEvaluationChecks, runEvaluationChecks } from "../../src/evaluation/harness.js";
import { createTempWorkspace } from "../helpers.js";

test("evaluation harness defines machine checks only", () => {
  assert.deepEqual(listEvaluationChecks(), [
    "runtime-status-builds",
    "project-map-builds",
    "memory-assets-readable",
    "extension-surface-current",
    "spec-store-available",
    "skill-packages-readable",
    "config-preflight-readable",
    "host-turn-boundary-runs",
    "remote-entrypoints-available",
    "recovery-drills-pass",
  ]);
});

test("evaluation harness runs local machine-verifiable checks", async (t) => {
  const root = await createTempWorkspace("eval-runner", t);

  const result = await runEvaluationChecks(root);

  assert.equal(result.checks.length, listEvaluationChecks().length);
  assert.equal(result.status, "passed");
  assert.ok(result.checks.every((check) => check.status === "passed"));
  assert.ok(result.checks.some((check) => check.id === "runtime-status-builds"));
  assert.ok(result.checks.some((check) => check.id === "host-turn-boundary-runs"));
  assert.ok(result.checks.some((check) => check.id === "remote-entrypoints-available"));
  assert.ok(result.checks.some((check) => check.id === "recovery-drills-pass"));
});
