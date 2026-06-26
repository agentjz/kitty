import { readdir } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const testsRoot = path.join(root, ".test-build", "tests");
const files = (await collectTestFiles(testsRoot))
  .filter(isCoreTestFile)
  .sort();

if (files.length === 0) {
  throw new Error("No compiled core tests found. Run npm run test:build first.");
}

const child = spawn(process.execPath, ["--test", ...files], {
  cwd: root,
  stdio: "inherit",
  windowsHide: true,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

async function collectTestFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectTestFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".test.js")) {
      files.push(fullPath);
    }
  }
  return files;
}

function relativePosix(file) {
  return path.relative(path.join(root, ".test-build"), file).split(path.sep).join("/");
}

function isCoreTestFile(file) {
  return !relativePosix(file).startsWith("tests/evaluation/");
}
