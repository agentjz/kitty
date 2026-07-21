import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createBashOutputCapture, DEFAULT_BASH_OUTPUT_PREVIEW_CHARS } from "../../src/tools/outputCapture.js";
import { governToolOutput } from "../../src/tools/outputGovernance/index.js";
import { createTempWorkspace } from "../helpers.js";

test("tool output governance preserves bounded test output verbatim", () => {
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
  });

  assert.equal(governance.kind, "test");
  assert.equal(governance.mode, "structured");
  assert.equal(governance.truncated, false);
  assert.match(governance.projection, /bash: test/);
  assert.match(governance.projection, /FAIL tests\/b\.test\.ts/);
  assert.match(governance.projection, /Tests: 1 failed/);
  assert.match(governance.projection, new RegExp(`x{${8_000}}`));
  assert.doesNotMatch(governance.projection, /truncated|full output/u);
});

test("tool output governance preserves every bounded search match", () => {
  const raw = Array.from({ length: 40 }, (_, index) => `src/file${index}.ts:${index + 1}:needle match`).join("\n");

  const governance = governToolOutput({
    toolName: "bash",
    command: "rg needle src",
    status: "completed",
    exitCode: 0,
    output: raw,
  });

  assert.equal(governance.kind, "search");
  assert.match(governance.projection, /src\/file0\.ts/);
  assert.match(governance.projection, /src\/file20\.ts/);
  assert.match(governance.projection, /src\/file39\.ts/);
});

test("tool output governance preserves bounded git diff content", () => {
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
  assert.match(governance.projection, /diff --git a\/src\/a\.ts b\/src\/a\.ts/);
  assert.match(governance.projection, /@@ -1 \+1 @@/);
  assert.match(governance.projection, /-old\n\+new/);
});

test("bash output capture preserves head and tail and stores oversized full output", async (t) => {
  const root = await createTempWorkspace("tool-output-head-tail", t);
  const raw = Array.from({ length: 120_000 }, (_, index) => `line ${index}: ${"x".repeat(60)}`).join("\n");
  const capture = await createBashOutputCapture({
    stateRootDir: root,
    sessionId: "session-output",
  });
  capture.append(raw);
  const bounded = await capture.finalize();

  const governance = governToolOutput({
    toolName: "bash",
    command: "node huge-output.js",
    status: "completed",
    exitCode: 0,
    durationMs: 1000,
    output: bounded.outputPreview,
    outputPath: bounded.outputPath,
    outputChars: bounded.outputChars,
    outputBytes: bounded.outputBytes,
    truncated: bounded.truncated,
  });

  assert.equal(governance.kind, "generic");
  assert.equal(governance.truncated, true);
  assert.equal(governance.outputPath, bounded.outputPath);
  assert.match(governance.projection, /tool output truncated/);
  assert.ok(governance.rawChars > 8_000_000);
  assert.ok(governance.projectedChars < DEFAULT_BASH_OUTPUT_PREVIEW_CHARS + 1_000);
  assert.match(governance.projection, /line 0:/);
  assert.match(governance.projection, /line 119999/);
  assert.match(governance.projection, /head and tail preserved/);
  assert.ok(bounded.outputPath);
  const saved = await fs.readFile(path.join(root, bounded.outputPath!), "utf8");
  assert.equal(saved, raw);
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
  });

  assert.match(governance.projection, /ROOT_CAUSE_SENTINEL/);
  assert.match(governance.projection, /exit=1/);
});

test("empty successful command output is an explicit complete fact", () => {
  const governance = governToolOutput({
    toolName: "bash",
    command: "git diff --quiet",
    status: "completed",
    exitCode: 0,
    output: "",
  });

  assert.equal(governance.kind, "empty");
  assert.match(governance.projection, /completed successfully/);
  assert.match(governance.projection, /stdout and stderr were empty; no result content is missing/);
});
