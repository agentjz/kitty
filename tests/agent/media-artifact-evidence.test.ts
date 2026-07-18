import assert from "node:assert/strict";
import test from "node:test";

import { buildToolResultEnvelope } from "../../src/agent/toolResults/evidenceBuilder.js";

test("generated media metadata becomes a typed file artifact", () => {
  const envelope = buildToolResultEnvelope({
    callId: "media-call",
    toolName: "generate_image",
    rawArguments: JSON.stringify({ prompt: "kite" }),
    cwd: "C:\\workspace",
    result: {
      ok: true,
      output: JSON.stringify({ ok: true, path: "C:\\workspace\\generated\\kite.png", bytes: 123 }),
      metadata: {
        changedPaths: ["C:\\workspace\\generated\\kite.png"],
        artifacts: [{ kind: "file", path: "C:\\workspace\\generated\\kite.png", bytes: 123, mimeType: "image/png" }],
      },
    },
  });
  assert.deepEqual(envelope.artifacts, [{ kind: "file", path: "generated/kite.png", bytes: 123 }]);
});
