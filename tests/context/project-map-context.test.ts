import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildContextRuntimePromptLayers } from "../../src/context/runtime/index.js";
import { loadProjectContext } from "../../src/context/projectContext.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("runtime context includes a concise project map fact block", async (t) => {
  const root = await createTempWorkspace("project-map-context", t);
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: {
      verify: "npm test",
    },
  }), "utf8");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "cli.ts"), "export {};\n", "utf8");

  const config = createTestRuntimeConfig(root);
  const projectContext = await loadProjectContext(root, {
    projectDocMaxBytes: config.projectDocMaxBytes,
  });
  const layers = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
    messages: [],
  });

  const prompt = layers.runtimeFactBlocks.join("\n\n");
  assert.match(prompt, /Scripts: verify/);
  assert.match(prompt, /src/);
});
