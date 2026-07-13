import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import packageJson from "../../package.json";

test("built CLI loads Node SQLite as a builtin module", () => {
  const result = spawnSync(process.execPath, [path.resolve("dist/cli.js"), "--version"], {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stdout.trim(), packageJson.version);
  assert.doesNotMatch(result.stderr, /Cannot find module ['"]sqlite['"]/);
});
