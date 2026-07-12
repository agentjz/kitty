import assert from "node:assert/strict";
import test from "node:test";

import type { ShellOutputPort } from "../../src/interaction/shell.js";
import { listSlashCommands } from "../../src/interaction/localCommandDefinitions.js";
import { writeCliInteractiveIntro } from "../../src/shell/cli/intro.js";

test("interactive intro prints session, cwd, and local commands", () => {
  const output = createRecordingOutput();

  writeCliInteractiveIntro({
    cwd: "C:\\workspace\\kitty",
    session: { id: "session-intro" },
    output,
    locale: "en",
  });

  const rendered = [...output.plainText, ...output.dimText].join("\n");
  assert.match(rendered, /session: session-intro/);
  assert.match(rendered, /cwd: C:\\workspace\\kitty/);
  assert.doesNotMatch(rendered, /Tools:/);
  for (const command of listSlashCommands("tui", "en")) {
    assert.match(rendered, new RegExp(`${escapeRegExp(command.name)}\\s+${escapeRegExp(command.description)}`));
  }
  assert.doesNotMatch(rendered, /\/resume|\/reset|\/doctor/);
});

test("interactive intro can print a supplied active tool surface label", () => {
  const output = createRecordingOutput();

  writeCliInteractiveIntro({
    cwd: "C:\\workspace\\kitty",
    session: { id: "session-spec" },
    output,
    locale: "en",
    toolsLabel: "custom runtime surface",
  });

  const rendered = [...output.plainText, ...output.dimText].join("\n");
  assert.match(rendered, /Tools: custom runtime surface/);
});

function createRecordingOutput(): ShellOutputPort & {
  plainText: string[];
  dimText: string[];
} {
  const plainText: string[] = [];
  const dimText: string[] = [];
  return {
    plainText,
    dimText,
    plain: (text) => plainText.push(text),
    dim: (text) => dimText.push(text),
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    heading: () => undefined,
    interrupt: () => undefined,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
