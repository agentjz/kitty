import assert from "node:assert/strict";
import test from "node:test";

import { governToolOutput } from "../../src/tools/outputGovernance/index.js";

test("tool output governance projects test failures into compact evidence", () => {
  const raw = [
    "npm test",
    "PASS tests/a.test.ts",
    "FAIL tests/b.test.ts",
    "Expected: 1",
    "Received: 2",
    "Test Suites: 1 failed, 1 passed, 2 total",
    "Tests: 1 failed, 9 passed, 10 total",
    "x".repeat(8000),
  ].join("\n");

  const governance = governToolOutput({
    toolName: "bash",
    command: "npm test",
    status: "failed",
    exitCode: 1,
    durationMs: 321,
    output: raw,
    outputPath: ".kitty/observability/command-output/session/output.txt",
    truncated: true,
  });

  assert.equal(governance.kind, "test");
  assert.equal(governance.mode, "structured");
  assert.equal(governance.truncated, true);
  assert.match(governance.projection, /bash: test/);
  assert.match(governance.projection, /FAIL tests\/b\.test\.ts/);
  assert.match(governance.projection, /Tests: 1 failed/);
  assert.match(governance.projection, /\[full output:/);
  assert.ok(governance.projectedChars < governance.rawChars);
  assert.ok(governance.savedTokens > 0);
  assert.ok(governance.savingsRatio > 0);
});

test("tool output governance projects search output with match counts", () => {
  const raw = Array.from({ length: 40 }, (_, index) => `src/file${index}.ts:${index + 1}:needle match`).join("\n");

  const governance = governToolOutput({
    toolName: "bash",
    command: "rg needle src",
    status: "completed",
    exitCode: 0,
    output: raw,
  });

  assert.equal(governance.kind, "search");
  assert.match(governance.projection, /matches shown: 24, omitted: 16/);
  assert.match(governance.projection, /src\/file0\.ts/);
  assert.match(governance.projection, /src\/file39\.ts/);
  assert.doesNotMatch(governance.projection, /src\/file20\.ts/);
});

test("tool output governance projects git diff files and hunks", () => {
  const raw = [
    "diff --git a/src/a.ts b/src/a.ts",
    "--- a/src/a.ts",
    "+++ b/src/a.ts",
    "@@ -1 +1 @@",
    "-old",
    "+new",
    "diff --git a/src/b.ts b/src/b.ts",
    "@@ -2 +2 @@",
  ].join("\n");

  const governance = governToolOutput({
    toolName: "bash",
    command: "git diff",
    status: "completed",
    exitCode: 0,
    output: raw,
  });

  assert.equal(governance.kind, "git_diff");
  assert.match(governance.projection, /files: src\/a\.ts -> src\/a\.ts, src\/b\.ts -> src\/b\.ts/);
  assert.match(governance.projection, /@@ -1 \+1 @@/);
});

test("tool output governance keeps huge generic output model-facing projection bounded", () => {
  const raw = Array.from({ length: 120_000 }, (_, index) => `line ${index}: ${"x".repeat(60)}`).join("\n");

  const governance = governToolOutput({
    toolName: "bash",
    command: "node huge-output.js",
    status: "completed",
    exitCode: 0,
    durationMs: 1000,
    output: raw,
    outputPath: ".kitty/observability/command-output/session/huge.txt",
    truncated: true,
  });

  assert.equal(governance.kind, "generic");
  assert.equal(governance.truncated, true);
  assert.equal(governance.outputPath, ".kitty/observability/command-output/session/huge.txt");
  assert.match(governance.projection, /\[full output:/);
  assert.ok(governance.rawChars > 8_000_000);
  assert.ok(governance.projectedChars < 4_000);
  assert.ok(governance.savedTokens > 1_000_000);
  assert.ok(governance.savingsRatio > 0.99);
  assert.match(governance.projection, /line 119999/);
  assert.match(governance.projection, /characters omitted/);
  assert.match(governance.projection, /inspect with read/);
});

test("tool output governance preserves a failure root cause that appears only at the tail", () => {
  const raw = [
    ...Array.from({ length: 500 }, (_, index) => `progress ${index}`),
    "ROOT_CAUSE_SENTINEL: database migration checksum mismatch",
  ].join("\n");

  const governance = governToolOutput({
    toolName: "bash",
    command: "node migrate.js",
    status: "failed",
    exitCode: 1,
    output: raw,
    outputPath: ".kitty/observability/command-output/session/migrate.txt",
    truncated: true,
  });

  assert.match(governance.projection, /ROOT_CAUSE_SENTINEL/);
  assert.match(governance.projection, /exit=1/);
  assert.match(governance.projection, /inspect with read/);
});
