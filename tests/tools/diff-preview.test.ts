import assert from "node:assert/strict";
import test from "node:test";

import { buildDiffPreview } from "../../src/tools/core/shared.js";

test("diff preview emits standard hunks with context instead of whole-file output", () => {
  const before = Array.from({ length: 20 }, (_, index) => `line ${index + 1}`);
  const after = before.slice();
  after[9] = "line 10 changed";

  const preview = buildDiffPreview(`${before.join("\n")}\n`, `${after.join("\n")}\n`);

  assert.match(preview, /^@@ -7,7 \+7,7 @@/);
  assert.match(preview, /^-line 10$/m);
  assert.match(preview, /^\+line 10 changed$/m);
  assert.match(preview, /^ line 7$/m);
  assert.match(preview, /^ line 13$/m);
  assert.doesNotMatch(preview, /line 1\n/);
  assert.doesNotMatch(preview, /line 20/);
  assert.doesNotMatch(preview, /truncated/i);
});

test("diff preview keeps every separated change hunk", () => {
  const before = Array.from({ length: 30 }, (_, index) => `line ${index + 1}`);
  const after = before.slice();
  after[2] = "first change";
  after[26] = "second change";

  const preview = buildDiffPreview(before.join("\n"), after.join("\n"));

  assert.equal(preview.match(/^@@ /gm)?.length, 2);
  assert.match(preview, /\+first change/);
  assert.match(preview, /\+second change/);
});
