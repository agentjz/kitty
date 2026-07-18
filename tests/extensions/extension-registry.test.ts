import assert from "node:assert/strict";
import test from "node:test";

import { EXTENSION_IDS, type ExtensionToggleConfig } from "../../src/config/extensions.js";
import { getExtensionDefinition } from "../../src/extensions/definitions.js";
import { createExtensionRegistry } from "../../src/extensions/index.js";
import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext } from "../helpers.js";

test("extension registry is driven by one toggle map", async (t) => {
  const root = await createTempWorkspace("extension-registry", t);
  const config = {
    ...createTestRuntimeConfig(root),
    extensions: Object.fromEntries(EXTENSION_IDS.map((id) => [id, true])) as ExtensionToggleConfig,
  };

  const registry = createExtensionRegistry(config);
  const enabled = registry.entries.filter((entry) => entry.enabled).map((entry) => entry.id);
  const names = registry.entries.flatMap((entry) => entry.tools.map((tool) => tool.definition.function.name));

  assert.deepEqual(enabled, EXTENSION_IDS);
  for (const id of EXTENSION_IDS) {
    assert.equal(registry.entries.find((entry) => entry.id === id)?.tools.length, getExtensionDefinition(id).createTools().length);
  }
  for (const name of getExtensionDefinition("skills").createTools().map((tool) => tool.definition.function.name)) {
    assert.equal(names.includes(name), true, `${name} should be registered`);
  }
  for (const name of getExtensionDefinition("documents").createTools().map((tool) => tool.definition.function.name)) {
    assert.equal(names.includes(name), true, `${name} should be registered`);
  }
});

test("documents extension registry exposes document reading and Word writing", () => {
  const names = getExtensionDefinition("documents").createTools().map((tool) => tool.definition.function.name);
  assert.deepEqual(names, ["document_read", "document_write"]);
});

test("media extension exposes image generation and durable video create or poll", () => {
  const names = getExtensionDefinition("media").createTools().map((tool) => tool.definition.function.name);
  assert.deepEqual(names, ["generate_image", "generate_video"]);
});

test("scheduler extension exposes one durable CRUD surface", () => {
  const names = getExtensionDefinition("scheduler").createTools().map((tool) => tool.definition.function.name);
  assert.deepEqual(names, ["schedule_create", "schedule_list", "schedule_update", "schedule_delete"]);
});

test("disabled extensions are not callable", async (t) => {
  const root = await createTempWorkspace("disabled-extension", t);
  const context = createToolContext(root);
  context.config.extensions.skills = false;
  const registry = await createDefaultAgentToolRegistry(context.config);

  assert.equal(registry.definitions.some((tool) => tool.function.name === "skill_load"), false);
  await assert.rejects(
    () => registry.execute("skill_load", "{}", context),
    /Unknown tool: skill_load/,
  );
});

test("skills extension registry exposes package loading, resources, scripts, and checks", () => {
  const names = getExtensionDefinition("skills").createTools().map((tool) => tool.definition.function.name).sort();

  assert.deepEqual(names, [
    "skill_check",
    "skill_list",
    "skill_load",
    "skill_read_resource",
    "skill_run_script",
  ]);
});
