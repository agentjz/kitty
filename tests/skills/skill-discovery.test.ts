import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildContextRuntimePromptLayers } from "../../src/context/runtime/prompt.js";
import { projectToolResultForModel } from "../../src/agent/toolResults/modelProjection.js";
import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { loadProjectContext } from "../../src/context/projectContext.js";
import { discoverSkills } from "../../src/skills/discovery.js";
import { createSkillTools } from "../../src/capabilities/tools/skills/index.js";
import { CapabilityManager } from "../../src/capabilities/manager.js";
import { SkillSchemaError } from "../../src/skills/schema.js";
import { createToolRegistry } from "../../src/tools/core/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext, parseToolJson } from "../helpers.js";

test("project runtime recursively loads only the current skills tree", async (t) => {
  const root = await createTempWorkspace("skill-discovery", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "VISIBLE_BODY");
  await writeFile(root, "skills/skepticism/references/checklist.md", "CHECKLIST_BODY");
  await writeSkill(root, ".agents/skills/dev/SKILL.md", "dev-only", "Development-agent-only method.", "HIDDEN_BODY");
  await writeSkill(root, ".skills/hidden/SKILL.md", "hidden", "Hidden legacy method.", "HIDDEN_BODY");
  await writeSkill(root, "SKILL.md", "root-only", "Root package.", "HIDDEN_BODY");
  await writeSkill(root, "skills/group/nested/SKILL.md", "nested", "Nested package.", "HIDDEN_BODY");

  const context = await loadProjectContext(root, { projectDocMaxBytes: 24_576 });

  const skepticism = context.skills.find((skill) => skill.name === "skepticism");
  const nested = context.skills.find((skill) => skill.name === "nested");
  assert.ok(skepticism);
  assert.ok(nested);
  assert.equal(context.skills.every((skill) => skill.path.replace(/\\/g, "/").startsWith("skills/")), true);
  assert.equal(skepticism?.body.includes("VISIBLE_BODY"), true);
  assert.deepEqual(skepticism?.resources.map((resource) => resource.path), [
    path.join("skills", "skepticism", "references", "checklist.md"),
  ]);
  assert.equal(skepticism?.resources[0]?.kind, "references");
  assert.equal(skepticism?.health.status, "ready");
  assert.equal(skepticism?.health.resourceGroups.references, 1);
});

test("project runtime rejects a standard package whose directory and metadata names differ", async (t) => {
  const root = await createTempWorkspace("skill-name-mismatch", t);
  await writeSkill(root, "skills/directory-name/SKILL.md", "metadata-name", "Mismatched package.", "BODY");

  await assert.rejects(
    discoverSkills(root, root, []),
    (error: unknown) => error instanceof SkillSchemaError && /must match its package directory/u.test(error.message),
  );
});

test("runtime prompt shows the skill index without loading full skill bodies", async (t) => {
  const root = await createTempWorkspace("skill-prompt-index", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "SECRET_FULL_SKILL_BODY");
  await writeFile(root, "skills/skepticism/references/checklist.md", "SECRET_RESOURCE_BODY");
  const config = createTestRuntimeConfig(root);
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: config.projectDocMaxBytes });

  const prompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
  }).runtimeFactBlocks.join("\n");

  assert.match(prompt, /Available skills/);
  assert.match(prompt, /skepticism: Skeptical review method/);
  assert.match(prompt, /resources=1/);
  assert.doesNotMatch(prompt, /SECRET_FULL_SKILL_BODY/);
  assert.doesNotMatch(prompt, /SECRET_RESOURCE_BODY/);
});

test("runtime prompt hides skill index when the skill capability is disabled", async (t) => {
  const root = await createTempWorkspace("skill-prompt-disabled", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "SECRET_FULL_SKILL_BODY");
  const config = createTestRuntimeConfig(root);
  const manager = new CapabilityManager(root, root, config);
  t.after(() => manager.close());
  await manager.setEnabled("skills", false);
  const loadedProjectContext = await loadProjectContext(root, { projectDocMaxBytes: config.projectDocMaxBytes });
  const projectContext = {
    ...loadedProjectContext,
    skills: manager.filterEnabledSkills(loadedProjectContext.skills),
  };

  const prompt = buildContextRuntimePromptLayers({
    cwd: root,
    config,
    projectContext,
  }).runtimeFactBlocks.join("\n");

  assert.doesNotMatch(prompt, /Available skills/);
  assert.doesNotMatch(prompt, /skepticism/);
  assert.doesNotMatch(prompt, /skill_load/);
});

test("skills capability lists summaries and explicitly loads full skill content", async (t) => {
  const root = await createTempWorkspace("skill-tools", t);
  await writeSkill(root, "skills/skepticism/SKILL.md", "skepticism", "Skeptical review method.", "FULL_SKILL_BODY");
  await writeFile(root, "skills/skepticism/references/checklist.md", "RESOURCE_BODY");
  await writeFile(root, "skills/skepticism/private.md", "PRIVATE_BODY");
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: 24_576 });
  const context = {
    ...createToolContext(root),
    projectContext,
  };
  const registry = createToolRegistry({
    onlyNames: ["skill_list", "skill_load", "skill_read_resource", "skill_run_script", "skill_check"],
    sources: [{
      kind: "host",
      id: "test:skills",
      tools: createSkillTools(),
    }],
  });

  const list = parseToolJson((await registry.execute("skill_list", "{}", context)).output);
  assert.equal(JSON.stringify(list).includes("FULL_SKILL_BODY"), false);
  assert.equal(JSON.stringify(list).includes("RESOURCE_BODY"), false);
  const listedSkill = (list.skills as Array<Record<string, unknown>>).find((item) => item.name === "skepticism");
  assert.ok(listedSkill);
  assert.deepEqual((listedSkill.resources as Array<Record<string, unknown>>).map((resource) => resource.path), [
    path.join("skills", "skepticism", "references", "checklist.md"),
  ]);
  assert.equal((listedSkill.health as Record<string, unknown>).status, "ready");

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
  const lifecycleLedger = new ControlPlaneLedger(root);
  const lifecycle = lifecycleLedger.taskLifecycle.loadCurrent(context.sessionId);
  lifecycleLedger.close();
  assert.equal(lifecycle?.verificationFacts.some((fact) => fact.includes("skill load: skepticism")), true);

  const resource = parseToolJson((await registry.execute("skill_read_resource", JSON.stringify({
    name: "skepticism",
    path: path.join("skills", "skepticism", "references", "checklist.md"),
  }), context)).output);
  assert.equal(resource.content, "RESOURCE_BODY");
  const privateRead = await registry.execute("skill_read_resource", JSON.stringify({
      name: "skepticism",
      path: path.join("skills", "skepticism", "private.md"),
    }), context);
  assert.equal(privateRead.ok, false);
  assert.match(privateRead.output, /does not declare resource/);
});

test("skills capability exposes examples and checks declared command dependencies", async (t) => {
  const root = await createTempWorkspace("skill-check", t);
  await writeSkill(
    root,
    "skills/runner/SKILL.md",
    "runner",
    "Script runner method.",
    "Use scripts when needed.",
    "node, definitely_missing_kitty_command",
  );
  await writeFile(root, "skills/runner/examples/basic.md", "EXAMPLE_BODY");
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: 24_576 });
  const context = {
    ...createToolContext(root),
    projectContext,
  };
  const registry = createToolRegistry({
    onlyNames: ["skill_list", "skill_read_resource", "skill_check"],
    sources: [{
      kind: "host",
      id: "test:skills",
      tools: createSkillTools(),
    }],
  });

  const list = parseToolJson((await registry.execute("skill_list", "{}", context)).output);
  const skill = (list.skills as Array<Record<string, unknown>>).find((item) => item.name === "runner")!;
  assert.deepEqual(skill.dependencies, [{ command: "node" }, { command: "definitely_missing_kitty_command" }]);
  assert.deepEqual((skill.resources as Array<Record<string, unknown>>).map((resource) => resource.path), [
    path.join("skills", "runner", "examples", "basic.md"),
  ]);

  const example = parseToolJson((await registry.execute("skill_read_resource", JSON.stringify({
    name: "runner",
    path: path.join("skills", "runner", "examples", "basic.md"),
  }), context)).output);
  assert.equal(example.content, "EXAMPLE_BODY");

  const check = parseToolJson((await registry.execute("skill_check", JSON.stringify({ name: "runner" }), context)).output);
  assert.equal(check.ok, false);
  assert.equal((check.health as Record<string, unknown>).status, "ready");
  const dependencies = check.dependencies as Array<Record<string, unknown>>;
  assert.equal(dependencies.find((item) => item.command === "node")?.available, true);
  assert.equal(dependencies.find((item) => item.command === "definitely_missing_kitty_command")?.available, false);
});

test("skills capability runs only declared script resources", async (t) => {
  const root = await createTempWorkspace("skill-script", t);
  await writeSkill(root, "skills/runner/SKILL.md", "runner", "Script runner method.", "Use scripts when needed.");
  await writeFile(root, "skills/runner/scripts/hello.js", "console.log('hello from skill script');\n");
  await writeFile(root, "skills/runner/references/not-script.md", "not executable");
  const projectContext = await loadProjectContext(root, { projectDocMaxBytes: 24_576 });
  const context = {
    ...createToolContext(root),
    projectContext,
  };
  const registry = createToolRegistry({
    onlyNames: ["skill_run_script"],
    sources: [{
      kind: "host",
      id: "test:skills",
      tools: createSkillTools(),
    }],
  });

  const result = parseToolJson((await registry.execute("skill_run_script", JSON.stringify({
    name: "runner",
    path: path.join("skills", "runner", "scripts", "hello.js"),
  }), context)).output);
  assert.equal(result.ok, true);
  assert.match(String(result.output), /hello from skill script/);

  const denied = await registry.execute("skill_run_script", JSON.stringify({
    name: "runner",
    path: path.join("skills", "runner", "references", "not-script.md"),
  }), context);
  assert.equal(denied.ok, false);
  assert.match(denied.output, /outside scripts/);
});

async function writeFile(root: string, relativePath: string, body: string): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, body, "utf8");
}

async function writeSkill(
  root: string,
  relativePath: string,
  name: string,
  description: string,
  body: string,
  requires?: string,
): Promise<void> {
  const filePath = path.join(root, relativePath);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, [
    "---",
    `name: ${name}`,
    `description: ${description}`,
    ...(requires ? [`requires: ${requires}`] : []),
    "---",
    "",
    body,
  ].join("\n"), "utf8");
}
