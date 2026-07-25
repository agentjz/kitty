import assert from "node:assert/strict";
import test from "node:test";

import { CapabilityManager } from "../../src/capabilities/manager.js";
import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { STATIC_CAPABILITY_DEFINITIONS } from "../../src/capabilities/definitions.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("capability manager owns discovery, health, and typed tool contributions", async (t) => {
  const root = await createTempWorkspace("capability-manager", t);
  const manager = new CapabilityManager(root, root, createTestRuntimeConfig(root));
  t.after(() => manager.close());

  const snapshots = manager.snapshot();
  assert.equal(snapshots.find((item) => item.id === "core-tools")?.status, "ready");
  assert.equal(snapshots.find((item) => item.id === "playwright")?.status, "disabled");
  assert.equal(snapshots.find((item) => item.id === "web")?.status, "ready");

  const contribution = await manager.contributeTools();
  assert.equal(contribution.toolNames.includes("read"), true);
  assert.equal(contribution.toolNames.includes("skill_load"), true);
  assert.equal(contribution.toolNames.includes("document_read"), true);
  assert.equal(contribution.toolNames.includes("web_search"), true);
  assert.equal(contribution.toolNames.includes("web_fetch"), true);
  assert.equal(contribution.toolNames.includes("web_download"), true);
  assert.equal(contribution.sources.every((source) => source.id.startsWith("capability:")), true);
});

test("disabled capabilities do not contribute model tools", async (t) => {
  const root = await createTempWorkspace("capability-disabled", t);
  const manager = new CapabilityManager(root, root, createTestRuntimeConfig(root));
  t.after(() => manager.close());

  await manager.setEnabled("skills", false);
  const contribution = await manager.contributeTools();
  assert.equal(contribution.toolNames.some((name) => name.startsWith("skill_")), false);
  assert.equal(manager.snapshot().find((item) => item.id === "skills")?.status, "disabled");
});

test("core tools can be disabled without leaving a second builtin execution surface", async (t) => {
  const root = await createTempWorkspace("capability-core-disabled", t);
  const config = createTestRuntimeConfig(root);
  const manager = new CapabilityManager(root, root, config);
  t.after(() => manager.close());

  await manager.setEnabled("core-tools", false);
  const contribution = await manager.contributeTools();
  for (const name of ["read", "write", "edit", "bash", "send_file"]) {
    assert.equal(contribution.toolNames.includes(name), false);
  }
  assert.equal(manager.snapshot().find((item) => item.id === "core-tools")?.status, "disabled");

  for (const definition of STATIC_CAPABILITY_DEFINITIONS) {
    if (definition.canDisable) await manager.setEnabled(definition.id, false);
  }
  const registry = await createDefaultAgentToolRegistry(config, { cwd: root, stateRootDir: root });
  t.after(() => registry.close?.());
  assert.deepEqual(registry.definitions, []);
});

test("skill packages are discovered as content capabilities without eager body injection", async (t) => {
  const root = await createTempWorkspace("capability-skills", t);
  const manager = new CapabilityManager(root, root, createTestRuntimeConfig(root));
  t.after(() => manager.close());
  const skills = [{
    name: "focused-review",
    description: "Focused review method.",
    path: "skills/focused-review/SKILL.md",
    absolutePath: `${root}/skills/focused-review/SKILL.md`,
    body: "SECRET_BODY",
    dependencies: [],
    resources: [],
    health: {
      status: "ready" as const,
      bodyPresent: true,
      resourceCount: 0,
      dependencyCount: 0,
      resourceGroups: { references: 0, scripts: 0, examples: 0, assets: 0, other: 0 },
      issues: [],
    },
  }];

  const snapshots = manager.snapshot(skills);
  const skill = snapshots.find((item) => item.id === "skill:focused-review");
  assert.equal(skill?.kind, "skill");
  assert.equal(JSON.stringify(skill).includes("SECRET_BODY"), false);
  assert.deepEqual(manager.filterEnabledSkills(skills).map((item) => item.name), ["focused-review"]);
});
