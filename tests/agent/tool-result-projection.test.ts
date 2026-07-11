import assert from "node:assert/strict";
import test from "node:test";

import { projectToolResultForModel } from "../../src/agent/toolResults/modelProjection.js";
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
        version: 1,
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
