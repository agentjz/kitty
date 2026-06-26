import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const scriptPath = path.resolve("scripts", "ensure-dist-built.mjs");

test("eval dist preflight fails clearly when dist cli is missing", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-dist-missing-"));

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /dist\/cli\.js is missing/);
  assert.match(result.stderr, /npm\.cmd run build/);
});

test("eval dist preflight passes when dist cli exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kitty-dist-ready-"));
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "cli.js"), "", "utf8");

  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: root,
    encoding: "utf8",
  });

  assert.equal(result.status, 0);
});
