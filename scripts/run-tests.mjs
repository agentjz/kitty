import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";

const mode = process.argv[2];
if (mode !== "core" && mode !== "evaluation") {
  throw new Error('Test mode must be "core" or "evaluation".');
}

const root = process.cwd();
const testsRoot = path.join(root, ".test-build", "tests");
const testTempRoot = path.join(root, ".test-tmp");
const files = (await collectTestFiles(testsRoot))
  .filter((file) => belongsToMode(file, mode))
  .sort();

if (files.length === 0) {
  await cleanupGeneratedTestState();
  throw new Error(`No compiled ${mode} tests found. Run npm run test:build first.`);
}

await rm(testTempRoot, { recursive: true, force: true });
await mkdir(testTempRoot, { recursive: true });

const child = spawn(process.execPath, [
  "--test",
  `--test-timeout=${mode === "core" ? 30_000 : 120_000}`,
  ...files,
], {
  cwd: root,
  env: {
    ...process.env,
    TEMP: testTempRoot,
    TMP: testTempRoot,
    TMPDIR: testTempRoot,
  },
  stdio: "inherit",
  windowsHide: true,
});

const shutdownSignals = ["SIGINT", "SIGTERM", "SIGHUP", "SIGBREAK"];
for (const signal of shutdownSignals) {
  process.once(signal, () => {
    if (settled) return;
    settled = true;
    terminateChildTree(child.pid);
    void cleanupGeneratedTestState().finally(() => process.exit(1));
  });
}

let settled = false;
child.on("error", async (error) => {
  if (settled) return;
  settled = true;
  console.error(error);
  await cleanupGeneratedTestState();
  process.exit(1);
});

child.on("exit", async (code, signal) => {
  if (settled) return;
  settled = true;
  await cleanupGeneratedTestState();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

function terminateChildTree(pid) {
  if (!pid) return;
  try {
    if (process.platform === "win32") {
      execFileSync("taskkill.exe", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    try { child.kill("SIGKILL"); } catch {}
  }
}

async function cleanupGeneratedTestState() {
  await Promise.all([
    rm(path.join(root, ".test-build"), { recursive: true, force: true }),
    rm(testTempRoot, { recursive: true, force: true }),
  ]);
}

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

function belongsToMode(file, selectedMode) {
  const evaluation = relativePosix(file).startsWith("tests/evaluation/");
  return selectedMode === "evaluation" ? evaluation : !evaluation;
}
