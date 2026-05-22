import { createSessionStore } from "../cli/commands/sessionHelpers.js";
import { runHostTurn } from "../host/turn.js";
import { createHostSession } from "../host/session.js";
import type { RuntimeConfig } from "../types.js";
import { isAgentWorkerExecutionKind, toAgentWorkerIdentityKind } from "./kinds.js";
import { ExecutionStore } from "./store.js";

export async function runExecutionWorker(input: {
  rootDir: string;
  cwd: string;
  config: RuntimeConfig;
  executionId: string;
}): Promise<void> {
  const store = new ExecutionStore(input.rootDir);
  const execution = store.load(input.executionId);
  if (!execution) {
    throw new Error(`Unknown execution: ${input.executionId}`);
  }
  if (!isAgentWorkerExecutionKind(execution.kind)) {
    throw new Error(`Execution ${execution.id} is '${execution.kind}', not an agent worker execution.`);
  }

  const sessionStore = await createSessionStore(input.config.paths.sessionsDir);
  const session = await createHostSession(sessionStore, execution.cwd || input.cwd);
  store.markRunning(execution.id, {
    pid: process.pid,
    sessionId: session.id,
  });

  const outcome = await runHostTurn({
    host: execution.kind,
    input: execution.prompt ?? "",
    cwd: execution.cwd || input.cwd,
    stateRootDir: input.rootDir,
    config: input.config,
    session,
    sessionStore,
    identity: {
      kind: toAgentWorkerIdentityKind(execution.kind),
      name: execution.actorName ?? execution.kind,
      role: execution.actorRole,
    },
  });

  store.close(execution.id, {
    status: outcome.status === "completed" ? "completed" : outcome.status === "aborted" ? "aborted" : "failed",
    summary: outcome.status,
    resultText: outcome.status === "completed" ? "Agent execution completed." : outcome.errorMessage,
  });
}
