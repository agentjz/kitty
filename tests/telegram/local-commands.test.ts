import assert from "node:assert/strict";
import test from "node:test";

import { listSlashCommands } from "../../src/interaction/localCommandDefinitions.js";
import { handleTelegramLocalCommand } from "../../src/telegram/localCommands.js";
import type { ShellOutputPort } from "../../src/interaction/shell.js";
import { createTestRuntimeConfig } from "../helpers.js";

test("telegram exposes only help and status while stop remains a service command", async () => {
  assert.deepEqual(listSlashCommands("telegram").map((command) => command.name), ["/status", "/help"]);
  const messages: string[] = [];
  const output: ShellOutputPort = {
    plain: (text) => messages.push(text), info: (text) => messages.push(text), warn: (text) => messages.push(text),
    error: (text) => messages.push(text), dim: (text) => messages.push(text), heading: (text) => messages.push(text),
    interrupt: (text) => messages.push(text),
  };
  const root = process.cwd();
  const context = {
    cwd: root,
    stateRootDir: root,
    session: { id: "telegram-session", revision: 0, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", cwd: root, messageCount: 0, messages: [] },
    config: createTestRuntimeConfig(root),
  };
  assert.equal(await handleTelegramLocalCommand("/help", context, output), "handled");
  assert.equal(await handleTelegramLocalCommand("/resume", context, output), "handled");
  assert.match(messages.join("\n"), /\/stop/);
  assert.doesNotMatch(messages.join("\n"), /\/session|\/config/);
});
