import { spawn } from "node:child_process";
import path from "node:path";

import type { RuntimeConfig } from "../types.js";

export function spawnExecutionWorker(input: {
  rootDir: string;
  config: RuntimeConfig;
  executionId: string;
}): number {
  if (process.env.KITTY_TEST_WORKER_MODE === "stub") {
    return process.pid;
  }

  const cliEntry = path.resolve(process.argv[1] ?? "");
  if (!cliEntry) {
    throw new Error("Unable to locate Kitty CLI entrypoint for execution worker.");
  }

  const child = spawn(process.execPath, [
    cliEntry,
    "-C",
    input.rootDir,
    "__worker__",
    "run",
    "--execution-id",
    input.executionId,
  ], {
    cwd: input.rootDir,
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env: process.env,
  });
  child.unref();
  if (!child.pid) {
    throw new Error("Failed to spawn execution worker.");
  }
  return child.pid;
}
