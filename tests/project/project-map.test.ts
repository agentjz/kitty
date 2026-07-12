import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { buildProjectMap } from "../../src/project/map.js";
import { createTempWorkspace, initGitRepo } from "../helpers.js";

test("project map exposes stable project facts without semantic judgment", async (t) => {
  const root = await createTempWorkspace("project-map", t);
  await fs.writeFile(path.join(root, "package.json"), JSON.stringify({
    scripts: {
      test: "node --test",
      build: "tsc",
    },
  }), "utf8");
  await fs.mkdir(path.join(root, "src"), { recursive: true });
  await fs.mkdir(path.join(root, "tests"), { recursive: true });
  await fs.writeFile(path.join(root, "src", "cli.ts"), "export {};\n", "utf8");
  await fs.writeFile(path.join(root, "tests", "cli.test.ts"), "export {};\n", "utf8");
  await fs.writeFile(path.join(root, "spec.md"), "# 核心\n", "utf8");
  await initGitRepo(root);

  const map = await buildProjectMap(root);

  assert.equal(map.rootDir, root);
  assert.deepEqual(map.packageScripts, ["build", "test"]);
  assert.ok(map.topLevelDirectories.includes("src"));
  assert.ok(map.topLevelDirectories.includes("tests"));
  assert.ok(map.entryFiles.some((entry) => entry.endsWith("src/cli.ts") || entry.endsWith("src\\cli.ts")));
  assert.ok(map.testDirectories.includes("tests"));
  assert.deepEqual(map.specDocuments, ["spec.md"]);
  assert.equal(map.git.available, true);
  assert.equal(map.git.hasChanges, true);
  assert.ok(map.summary.includes("Scripts: build, test"));
});

test("project map degrades when package and git facts are missing", async (t) => {
  const root = await createTempWorkspace("project-map-no-git", t, { gitBoundary: "unavailable" });
  await fs.mkdir(path.join(root, "src"), { recursive: true });

  const map = await buildProjectMap(root);

  assert.equal(map.packageScripts.length, 0);
  assert.equal(map.git.available, false);
  assert.ok(map.summary.includes("Git: unavailable"));
});
