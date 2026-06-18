import assert from "node:assert/strict";
import test from "node:test";

import { listEvaluationChecks, listEvaluationScenarios, runEvaluationChecks } from "../../src/evaluation/harness.js";
import { createTempWorkspace } from "../helpers.js";

test("evaluation harness defines current local acceptance checks", () => {
  assert.deepEqual(listEvaluationChecks(), [
    "runtime-status-builds",
    "project-map-builds",
    "memory-assets-readable",
    "extension-surface-current",
    "skill-packages-readable",
    "config-preflight-readable",
    "cache-economy-ready",
    "production-scene-ready",
    "host-turn-boundary-runs",
    "remote-entrypoints-available",
    "recovery-drills-pass",
  ]);
});

test("evaluation harness exposes product acceptance scenarios for every check", () => {
  const checks = listEvaluationChecks();
  const scenarios = listEvaluationScenarios();

  assert.deepEqual(scenarios.map((scenario) => scenario.id), checks);
  for (const scenario of scenarios) {
    assert.ok(scenario.title.trim().length > 0);
    assert.ok(scenario.userPath.trim().length > 20);
    assert.ok(scenario.evidence.trim().length > 0);
  }
});

test("evaluation harness runs local machine-verifiable checks", async (t) => {
  const root = await createTempWorkspace("eval-runner", t);

  const result = await runEvaluationChecks(root);

  assert.equal(result.checks.length, listEvaluationChecks().length);
  assert.equal(result.status, "passed");
  assert.ok(result.checks.every((check) => check.status === "passed"));
  assert.ok(result.checks.some((check) => check.id === "runtime-status-builds"));
  assert.ok(result.checks.some((check) => check.id === "cache-economy-ready"));
  assert.ok(result.checks.some((check) => check.id === "production-scene-ready"));
  assert.ok(result.checks.some((check) => check.id === "host-turn-boundary-runs"));
  assert.ok(result.checks.some((check) => check.id === "remote-entrypoints-available"));
  assert.ok(result.checks.some((check) => check.id === "recovery-drills-pass"));
});
