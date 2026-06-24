import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { createDefaultAgentToolRegistry } from "../../src/tools/registry.js";
import { createTempWorkspace, createTestRuntimeConfig, createToolContext, parseToolJson } from "../helpers.js";

test("agent registry exposes the foundation tools", async (t) => {
  const root = await createTempWorkspace("foundation-tools", t);
  const registry = await createDefaultAgentToolRegistry(createTestRuntimeConfig(root));
  const names = registry.definitions.map((tool) => tool.function.name);

  for (const name of ["read", "edit", "write", "bash", "send_file"]) {
    assert.equal(names.includes(name), true);
  }
});

test("read write edit bash complete the coding loop", async (t) => {
  const root = await createTempWorkspace("foundation-loop", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  const write = await registry.execute("write", JSON.stringify({
    path: "src/message.txt",
    content: "alpha\nbeta\n",
    create_directories: true,
  }), context);
  assert.equal(write.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "message.txt"), "utf8"), "alpha\nbeta\n");

  const read = await registry.execute("read", JSON.stringify({
    path: "src/message.txt",
    offset: 1,
    limit: 2,
  }), context);
  assert.equal(read.ok, true);
  assert.match(String(parseToolJson(read.output).content), /alpha/);

  const edit = await registry.execute("edit", JSON.stringify({
    path: "src/message.txt",
    edits: [{ oldText: "beta", newText: "gamma" }],
  }), context);
  assert.equal(edit.ok, true);
  assert.equal(await fs.readFile(path.join(root, "src", "message.txt"), "utf8"), "alpha\ngamma\n");

  const bash = await registry.execute("bash", JSON.stringify({
    command: "node -e \"const fs=require('fs'); process.stdout.write(fs.readFileSync('src/message.txt','utf8'))\"",
    cwd: ".",
    timeout_ms: 30_000,
  }), context);
  assert.equal(bash.ok, true);
  assert.equal(parseToolJson(bash.output).exitCode, 0);
});

test("bash reports missing commands as failed machine facts", async (t) => {
  const root = await createTempWorkspace("foundation-bash-missing", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  const result = await registry.execute("bash", JSON.stringify({
    command: "kitty_missing_command_for_bash_fact --version",
    cwd: ".",
    timeout_ms: 30_000,
  }), context);
  const payload = parseToolJson(result.output);

  assert.equal(result.ok, true);
  assert.equal(payload.command, "kitty_missing_command_for_bash_fact --version");
  assert.equal(payload.status, "failed");
  assert.notEqual(payload.exitCode, 0);
  assert.doesNotMatch(String(payload.output), /#< CLIXML|<Objs\b/);
});

test("send_file returns error when host does not support file delivery", async (t) => {
  const root = await createTempWorkspace("send-file-nohost", t);
  const context = createToolContext(root);
  const registry = await createDefaultAgentToolRegistry(context.config);

  const result = await registry.execute("send_file", JSON.stringify({
    filePath: "any-file.txt",
  }), context);

  assert.equal(result.ok, false);
  const output = parseToolJson(result.output);
  assert.equal(output.ok, false);
  assert.match(String(output.error), /only available when the host supports file delivery/);
});

test("send_file returns error when file not found", async (t) => {
  const root = await createTempWorkspace("send-file-missing", t);
  const context = createToolContext(root);
  context.enqueueFile = async () => "entry-id";
  const registry = await createDefaultAgentToolRegistry(context.config);

  const result = await registry.execute("send_file", JSON.stringify({
    filePath: "/nonexistent/path/file.txt",
  }), context);

  assert.equal(result.ok, false);
  const output = parseToolJson(result.output);
  assert.match(String(output.error), /not found/);
});

test("send_file calls enqueueFile and returns success", async (t) => {
  const root = await createTempWorkspace("send-file-ok", t);
  const filePath = path.join(root, "test.txt");
  await fs.writeFile(filePath, "hello", "utf8");

  const context = createToolContext(root);
  let captured: { filePath: string; fileName?: string; caption?: string } | undefined;
  context.enqueueFile = async (fp, fn, cap) => {
    captured = { filePath: fp, fileName: fn, caption: cap };
    return "entry-42";
  };
  const registry = await createDefaultAgentToolRegistry(context.config);

  const result = await registry.execute("send_file", JSON.stringify({
    filePath,
    fileName: "display-name.txt",
    caption: "Here is your file",
  }), context);

  assert.equal(result.ok, true);
  assert.equal(captured?.filePath, filePath);
  assert.equal(captured?.fileName, "display-name.txt");
  assert.equal(captured?.caption, "Here is your file");
  const output = parseToolJson(result.output);
  assert.equal(output.ok, true);
  assert.equal(output.entryId, "entry-42");
});
