import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildCliProgram } from "../../src/cli/program.js";
import {
  listEvaluationChecks,
  listEvaluationScenarios,
  listProductionEvaluationChecks,
  listProductionEvaluationScenarios,
  runEvaluationChecks,
} from "../../src/evaluation/harness.js";
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
    "tool-output-governance-ready",
    "production-scene-ready",
    "host-turn-boundary-runs",
    "background-subagent-lifecycle-ready",
    "delegation-behavior-boundary-ready",
    "remote-entrypoints-available",
    "recovery-drills-pass",
  ]);
});

test("evaluation harness defines explicit production acceptance checks", () => {
  assert.deepEqual(listProductionEvaluationChecks(), [
    "production-config-preflight",
    "production-provider-probe",
    "production-real-turn",
    "production-tool-turn",
    "production-runtime-status",
  ]);
});

test("evaluation harness exposes product acceptance scenarios for every check", () => {
  const checks = listEvaluationChecks();
  const scenarios = listEvaluationScenarios();

  assert.deepEqual(scenarios.map((scenario) => scenario.id), checks);
  for (const scenario of scenarios) {
    assert.equal(scenario.suite, "local");
    assert.ok(scenario.title.trim().length > 0);
    assert.ok(scenario.userPath.trim().length > 20);
    assert.ok(scenario.evidence.trim().length > 0);
  }
});

test("production scenarios are explicit and separate from local scenarios", () => {
  const scenarios = listProductionEvaluationScenarios();

  assert.deepEqual(scenarios.map((scenario) => scenario.id), listProductionEvaluationChecks());
  assert.ok(scenarios.every((scenario) => scenario.suite === "production"));
});

test("evaluation harness runs local machine-verifiable checks", async (t) => {
  const root = await createTempWorkspace("eval-runner", t);

  const result = await runEvaluationChecks(root, "local");

  assert.equal(result.suite, "local");
  assert.equal(result.checks.length, listEvaluationChecks().length);
  assert.equal(result.status, "passed");
  assert.ok(result.checks.every((check) => check.status === "passed"));
  assert.ok(result.checks.some((check) => check.id === "runtime-status-builds"));
  assert.ok(result.checks.some((check) => check.id === "cache-economy-ready"));
  assert.ok(result.checks.some((check) => check.id === "tool-output-governance-ready"));
  assert.ok(result.checks.some((check) => check.id === "production-scene-ready"));
  assert.ok(result.checks.some((check) => check.id === "host-turn-boundary-runs"));
  assert.ok(result.checks.some((check) => check.id === "background-subagent-lifecycle-ready"));
  assert.ok(result.checks.some((check) => check.id === "delegation-behavior-boundary-ready"));
  assert.ok(result.checks.some((check) => check.id === "remote-entrypoints-available"));
  assert.ok(result.checks.some((check) => check.id === "recovery-drills-pass"));
});

test("eval command can run local checks", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-eval-run-"));
  const program = buildCliProgram();

  program.exitOverride();
  await program.parseAsync(["-C", root, "eval", "--run-local"], { from: "user" });
});

test("eval command does not keep the old generic run flag", async () => {
  const program = buildCliProgram();
  const evalCommand = program.commands.find((command) => command.name() === "eval");

  assert.ok(evalCommand);
  assert.deepEqual(
    evalCommand.options.map((option) => option.flags),
    [
      "--json",
      "--run-local",
      "--run-production",
    ],
  );
});

test("eval command exits non-zero when explicit production acceptance fails", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-eval-failing-production-"));
  fs.mkdirSync(path.join(root, ".kitty"), { recursive: true });
  const previousExitCode = process.exitCode;
  const program = buildCliProgram();

  program.exitOverride();
  try {
    await program.parseAsync(["-C", root, "eval", "--run-production"], { from: "user" });
    assert.equal(process.exitCode, 1);
  } finally {
    process.exitCode = previousExitCode;
  }
});

test("eval command lists scenarios without running provider checks", async () => {
  const program = buildCliProgram();

  program.exitOverride();
  await program.parseAsync(["eval", "--json"], { from: "user" });
});
