import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { projectToolResultForModel } from "../../src/agent/toolResults/modelProjection.js";
import { loadProjectContext } from "../../src/context/projectContext.js";
import { createSkillTools } from "../../src/extensions/tools/skills/index.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext, parseToolJson } from "../helpers.js";

test("project skills are discovered from runtime skill roots but not .codex skills", async (t) => {
  const root = await createTempWorkspace("skill-discovery", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "VISIBLE_BODY");
  await writeSkill(root, ".codex/skills/dev/SKILL.md", "dev-only", "Codex-only development method.", "HIDDEN_BODY");

  const context = await loadProjectContext(root, { projectDocMaxBytes: 24_576 });

  assert.deepEqual(context.skills.map((skill) => skill.name), ["skepticism"]);
  assert.equal(context.skills[0]?.body.includes("VISIBLE_BODY"), true);
});

test("runtime prompt shows the skill index without loading full skill bodies", async (t) => {
  const root = await createTempWorkspace("skill-prompt-index", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "SECRET_FULL_SKILL_BODY");
  const config = createTestRuntimeConfig(root);
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: config.projectDocMaxBytes });

  const prompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
  }).runtimeFactBlocks.join("\n");

  assert.match(prompt, /Available skills/);
  assert.match(prompt, /skepticism: Skeptical review method/);
  assert.doesNotMatch(prompt, /SECRET_FULL_SKILL_BODY/);
});

test("runtime prompt hides skill index when the skills extension is disabled", async (t) => {
  const root = await createTempWorkspace("skill-prompt-disabled", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "SECRET_FULL_SKILL_BODY");
  const config = createTestRuntimeConfig(root);
  config.extensions.skills = false;
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: config.projectDocMaxBytes });

  const prompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
  }).runtimeFactBlocks.join("\n");

  assert.doesNotMatch(prompt, /Available skills/);
  assert.doesNotMatch(prompt, /skepticism/);
  assert.doesNotMatch(prompt, /skill_load/);
});

test("skills extension lists summaries and explicitly loads full skill content", async (t) => {
  const root = await createTempWorkspace("skill-tools", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "FULL_SKILL_BODY");
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: 24_576 });
  const context = {
    ...createToolContext(root),
    projectContext,
  };
  const registry = createToolRegistry({
    onlyNames: ["skill_list", "skill_load"],
    sources: [{
      kind: "host",
      id: "test:skills",
      tools: createSkillTools(),
    }],
  });

  const list = parseToolJson((await registry.execute("skill_list", "{}", context)).output);
  assert.equal(list.total, 1);
  assert.equal(JSON.stringify(list).includes("FULL_SKILL_BODY"), false);

  const loaded = parseToolJson((await registry.execute("skill_load", JSON.stringify({ name: "skepticism" }), context)).output);
  assert.equal(loaded.ok, true);
  assert.equal((loaded.skill as { name?: string }).name, "skepticism");
  assert.equal(loaded.body, "FULL_SKILL_BODY");

  const modelView = projectToolResultForModel({
    toolName: "skill_load",
    result: {
      ok: true,
      output: JSON.stringify(loaded),
    },
  });
  assert.match(modelView, /loaded skill: skepticism/);
  assert.match(modelView, /FULL_SKILL_BODY/);
});

async function writeSkill(
  root: string,
  relativePath: string,
  name: string,
  description: string,
  body: string,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    "---",
    "",
    body,
  ].join("\n"), "utf8");
}
