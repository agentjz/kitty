import assert from "node:assert/strict";
import test from "node:test";

import { listEvaluationScenarios } from "../../src/evaluation/harness.js";

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
  }
});
