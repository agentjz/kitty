import assert from "node:assert/strict";
import test from "node:test";

import { createCleanupStack } from "../../src/shell/tui/lifecycle.js";

test("tui cleanup stack releases resources once in reverse order", () => {
  const cleanup = createCleanupStack();
  const calls: string[] = [];

  cleanup.add(() => calls.push("renderer"));
  cleanup.add(() => calls.push("shell"));
  cleanup.run();
  cleanup.run();

  assert.deepEqual(calls, ["shell", "renderer"]);
});

test("tui cleanup stack immediately runs late cleanup after disposal", () => {
  const cleanup = createCleanupStack();
  const calls: string[] = [];

  cleanup.run();
  cleanup.add(() => calls.push("late"));

  assert.deepEqual(calls, ["late"]);
});
