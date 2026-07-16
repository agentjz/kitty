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

test("development CLI uses the production build contract", () => {
  const command = process.platform === "win32" ? (process.env.ComSpec ?? "cmd.exe") : "npm";
  const args = process.platform === "win32"
    ? ["/d", "/s", "/c", "npm.cmd run dev -- --version"]
    : ["run", "dev", "--", "--version"];
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
    windowsHide: true,
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.equal(result.stdout.trim().split(/\r?\n/).at(-1), packageJson.version);
  assert.doesNotMatch(result.stderr, /ERR_PACKAGE_PATH_NOT_EXPORTED|ERR_REQUIRE_CYCLE_MODULE/);
});
