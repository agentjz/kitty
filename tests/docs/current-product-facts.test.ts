import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const rootDir = process.cwd();

test("public docs do not expose removed runtime spec mode", () => {
  const docs = [
    ["README.md", fs.readFileSync(path.join(rootDir, "README.md"), "utf8")],
    ["philosophy.md", fs.readFileSync(path.join(rootDir, "philosophy.md"), "utf8")],
  ] as const;
  const forbidden = [
    /kitty spec/i,
    /spec mode/i,
    /spec 工作流/i,
    /requirements\.md/,
    /design\.md/,
    /tasks\.md/,
    /notes\.md/,
  ];

  for (const [name, content] of docs) {
    for (const pattern of forbidden) {
      assert.doesNotMatch(content, pattern, `${name} should not describe removed runtime spec mode`);
    }
  }
});

test("public docs describe eval as product acceptance", () => {
  const readme = fs.readFileSync(path.join(rootDir, "README.md"), "utf8");
  const philosophy = fs.readFileSync(path.join(rootDir, "philosophy.md"), "utf8");

  assert.match(readme, /产品验收/);
  assert.match(philosophy, /产品验收合同/);
});
