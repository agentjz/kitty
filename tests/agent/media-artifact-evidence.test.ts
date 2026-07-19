import assert from "node:assert/strict";
import test from "node:test";

import { buildToolResultEnvelope } from "../../src/agent/toolResults/evidenceBuilder.js";

test("generated media metadata becomes a typed workspace-relative file artifact", () => {
  for (const [cwd, artifactPath] of [
    ["C:\\workspace", "C:\\workspace\\generated\\kite.png"],
    ["/workspace", "/workspace/generated/kite.png"],
  ] as const) {
    const envelope = buildToolResultEnvelope({
      callId: "media-call",
      toolName: "generate_image",
      rawArguments: JSON.stringify({ prompt: "kite" }),
      cwd,
      result: {
        ok: true,
        output: JSON.stringify({ ok: true, path: artifactPath, bytes: 123 }),
        metadata: {
          changedPaths: [artifactPath],
          artifacts: [{ kind: "file", path: artifactPath, bytes: 123, mimeType: "image/png" }],
        },
      },
    });
    assert.deepEqual(
      envelope.artifacts,
      [{ kind: "file", path: "generated/kite.png", bytes: 123 }],
      `artifact path should be workspace-relative for cwd ${cwd}`,
    );
  }
});
