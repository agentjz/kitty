import assert from "node:assert/strict";
import test from "node:test";

import { listSlashCommands } from "../../src/interaction/localCommandDefinitions.js";
import { formatRemoteCommandHelp, parseRemoteCommand } from "../../src/remote/commands.js";

test("telegram projects the shared remote command registry", () => {
  assert.deepEqual(listSlashCommands("telegram").map((command) => command.name), ["/status", "/help", "/stop", "/new"]);
  const help = formatRemoteCommandHelp("telegram", "en");
  assert.match(help, /\/stop/);
  assert.match(help, /\/new/);
  assert.equal(parseRemoteCommand("/new", "telegram"), "new");
  assert.equal(parseRemoteCommand("/resume", "telegram"), undefined);
  assert.doesNotMatch(help, /\/session|\/config/);
});
