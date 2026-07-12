import assert from "node:assert/strict";
import test from "node:test";

import { projectTuiToolCallFact } from "../../src/shell/tui/toolFacts.js";

test("tui tool activity displays only the tool name", () => {
  const cases = [
    ["bash", JSON.stringify({ command: "Get-ChildItem C:/secret/path" })],
    ["read", JSON.stringify({ path: "C:/secret/file.ts", offset: 80 })],
    ["edit", JSON.stringify({ path: "C:/secret/file.ts", oldText: "before", newText: "after" })],
  ] as const;
  for (const [name, args] of cases) {
    const fact = projectTuiToolCallFact(name, args, { now: 1 });
    assert.equal(fact.activity.summary, name);
    assert.equal(fact.activity.detail, undefined);
    assert.doesNotMatch(fact.activity.summary, /secret|Get-ChildItem|before|after/);
  }
});
