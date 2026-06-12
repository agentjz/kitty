import assert from "node:assert/strict";
import test from "node:test";

import { listEvaluationScenarios, runEvaluationScenarios } from "../../src/evaluation/harness.js";
import { createTempWorkspace } from "../helpers.js";

test("evaluation harness defines real agent experience scenarios", () => {
  const scenarios = listEvaluationScenarios();
  const ids = scenarios.map((scenario) => scenario.id);

  assert.ok(ids.includes("simple-question-stays-small"));
  assert.ok(ids.includes("long-session-keeps-confirmed-facts"));
  assert.ok(ids.includes("background-can-recover-or-terminate"));
  assert.ok(ids.includes("subagent-wakes-lead-with-result"));
  assert.ok(ids.includes("spec-workflow-completes"));

  for (const scenario of scenarios) {
    assert.ok(scenario.userExperience.trim());
    assert.ok(scenario.machineFacts.length > 0);
    assert.ok(scenario.acceptance.length > 0);
    assert.ok(scenario.checks.length > 0);
  }
});

test("evaluation harness runs local machine-verifiable checks", async (t) => {
  const root = await createTempWorkspace("eval-runner", t);

  const results = await runEvaluationScenarios(root);

  assert.equal(results.length, listEvaluationScenarios().length);
  assert.equal(results.every((result) => result.status === "passed"), true);
  assert.ok(results.some((result) =>
    result.checks.some((check) => check.id === "runtime-status-builds" && check.status === "passed"),
  ));
});
