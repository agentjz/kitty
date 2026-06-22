import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createToolContext, parseToolJson } from "../helpers.js";

test("bash tool records governed output and recoverable raw output", async (t) => {
  const root = await createTempWorkspace("bash-output-governance", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  const result = await registry.execute("bash", JSON.stringify({
    command: "node -e \"for (let i=0;i<900;i++) console.log('FAIL tests/demo.test.ts expected received line '+i)\"",
    timeout_ms: 30_000,
  }), context);

  assert.equal(result.ok, true);
  assert.ok(result.metadata?.outputGovernance);
  const governance = result.metadata.outputGovernance;
  assert.equal(governance.kind, "test");
  assert.equal(governance.truncated, true);
  assert.ok(governance.outputPath);
  assert.match(governance.projection, /bash: test/);
  assert.match(governance.projection, /\[full output:/);

  const payload = parseToolJson(result.output);
  assert.ok(payload.outputGovernance);
  assert.equal((payload.outputGovernance as Record<string, unknown>).kind, "test");
  assert.equal(typeof (payload.outputGovernance as Record<string, unknown>).savedTokens, "number");

  const fullPath = path.join(root, String(governance.outputPath));
  const raw = await fs.readFile(fullPath, "utf8");
  assert.match(raw, /line 899/);
});
