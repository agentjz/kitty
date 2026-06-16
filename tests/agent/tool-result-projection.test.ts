import assert from "node:assert/strict";
import test from "node:test";

import { projectToolResultForModel } from "../../src/agent/toolResults/modelProjection.js";

test("background check projection exposes execution identity and output facts", () => {
  const output = projectToolResultForModel({
    toolName: "background_check",
    result: {
      ok: true,
      output: JSON.stringify({
        total: 1,
        active: [],
        recent: [
          {
            id: "exec-1",
            kind: "background",
            status: "completed",
            summary: "background-ok",
            outputPreview: "background-ok",
          },
        ],
      }),
    },
  });

  assert.match(output, /total: 1/);
  assert.match(output, /exec-1/);
  assert.match(output, /completed/);
  assert.match(output, /background-ok/);
});

test("subagent check projection exposes worker result facts", () => {
  const output = projectToolResultForModel({
    toolName: "subagent_check",
    result: {
      ok: true,
      output: JSON.stringify({
        total: 1,
        active: [],
        recent: [
          {
            id: "exec-worker",
            kind: "subagent",
            status: "completed",
            summary: "worker-ok",
          },
        ],
      }),
    },
  });

  assert.match(output, /exec-worker/);
  assert.match(output, /subagent/);
  assert.match(output, /worker-ok/);
});
