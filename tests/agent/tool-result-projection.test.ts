import assert from "node:assert/strict";
import test from "node:test";

import { projectToolResultForModel } from "../../src/agent/toolResults/modelProjection.js";
import { buildToolResultEnvelope } from "../../src/agent/toolResults/evidenceBuilder.js";
import type { ToolExecutionResult } from "../../src/types.js";

test("tool result projection uses output governance as the model-facing evidence", () => {
  const result: ToolExecutionResult = {
    ok: true,
    output: JSON.stringify({
      output: "RAW OUTPUT SHOULD NOT BE USED",
      outputGovernance: {
        projection: "governed projection from payload",
      },
    }),
    metadata: {
      outputGovernance: {
        kind: "test",
        mode: "structured",
        projection: "governed projection from metadata",
        rawChars: 10_000,
        projectedChars: 32,
        rawTokens: 2500,
        projectedTokens: 8,
        savedTokens: 2492,
        savingsRatio: 0.9968,
        truncated: true,
        outputPath: ".kitty/observability/command-output/session/output.txt",
        recoveryHint: "[full output: .kitty/observability/command-output/session/output.txt]",
        degraded: false,
        reason: "structured_projection",
      },
    },
  };

  assert.equal(projectToolResultForModel({ toolName: "bash", result }), "governed projection from metadata");
});

test("tool result projection never returns an empty model message", () => {
  assert.equal(
    projectToolResultForModel({
      toolName: "network_probe",
      result: { ok: true, output: "" },
    }),
    "network_probe completed without text output.",
  );
});

test("tool result envelope keeps model, compact, provenance, and recovery evidence together", () => {
  const envelope = buildToolResultEnvelope({
    callId: "call-1",
    toolName: "bash",
    rawArguments: JSON.stringify({ command: "npm test" }),
    cwd: "C:\\workspace",
    result: {
      ok: false,
      output: JSON.stringify({
        command: "npm test",
        cwd: "C:\\workspace",
        exitCode: 1,
        status: "failed",
        durationMs: 80,
        outputPath: ".kitty/observability/command-output/session/test.txt",
        error: "ROOT_CAUSE_SENTINEL",
      }),
      metadata: {
        outputGovernance: {
          kind: "test",
          mode: "structured",
          projection: "bash: test  exit=1\nROOT_CAUSE_SENTINEL\n[full output: .kitty/observability/command-output/session/test.txt]",
          rawChars: 10_000,
          projectedChars: 120,
          rawTokens: 2500,
          projectedTokens: 30,
          savedTokens: 2470,
          savingsRatio: 0.988,
          truncated: true,
          outputPath: ".kitty/observability/command-output/session/test.txt",
          recoveryHint: "read artifact",
          degraded: false,
          reason: "structured_projection",
        },
      },
    },
  });

  assert.equal(envelope.status, "error");
  assert.equal(envelope.facts.exitCode, 1);
  assert.match(envelope.modelView, /ROOT_CAUSE_SENTINEL/);
  assert.match(envelope.compactView, /exitCode=1/);
  assert.equal(envelope.artifacts[0]?.path, ".kitty/observability/command-output/session/test.txt");
  assert.deepEqual(envelope.artifacts[0]?.recovery, {
    tool: "read",
    arguments: { path: ".kitty/observability/command-output/session/test.txt" },
  });
});
