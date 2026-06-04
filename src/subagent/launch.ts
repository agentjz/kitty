import { ExecutionStore, type ExecutionRecord } from "../execution/store.js";
import { spawnExecutionWorker } from "../execution/launch.js";
import type { RuntimeConfig } from "../types.js";

export function launchSubagentExecution(input: {
  rootDir: string;
  cwd: string;
  requestedBy: string;
  role: string;
  objective: string;
  boundary?: string;
  expectedOutput?: string;
  prompt: string;
  config: RuntimeConfig;
  timeoutMs?: number;
}): ExecutionRecord {
  const store = new ExecutionStore(input.rootDir);
  const execution = store.create({
    kind: "subagent",
    prompt: input.prompt,
    assignment: {
      objective: input.objective,
      boundary: input.boundary,
      expectedOutput: input.expectedOutput,
    },
    cwd: input.cwd,
    requestedBy: input.requestedBy,
    actorName: buildSubagentName(input.role, input.objective),
    actorRole: input.role,
    timeoutMs: input.timeoutMs,
  });
  const pid = spawnExecutionWorker({
    rootDir: input.rootDir,
    config: input.config,
    executionId: execution.id,
  });
  return store.markRunning(execution.id, {
    pid,
  });
}

function buildSubagentName(role: string, objective: string): string {
  const slug = objective
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
  return `${role}-${slug || "task"}`;
}
