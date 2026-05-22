import { createSessionStore } from "../cli/commands/sessionHelpers.js";
import { runHostTurn } from "../host/turn.js";
import { createHostSession } from "../host/session.js";
import { TeamStore } from "../team/store.js";
import type { RuntimeConfig } from "../types.js";
import { isAgentWorkerExecutionKind, toAgentWorkerIdentityKind } from "./kinds.js";
import { ExecutionStore } from "./store.js";

export async function runExecutionWorker(input: {
  rootDir: string;
  cwd: string;
  config: RuntimeConfig;
  executionId: string;
  runTurn?: typeof runHostTurn;
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

  const runTurn = input.runTurn ?? runHostTurn;
  const outcome = await runTurn({
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

  const status = outcome.status === "completed" ? "completed" : outcome.status === "aborted" ? "aborted" : "failed";
  const closed = store.close(execution.id, {
    status,
    summary: outcome.status,
    resultText: outcome.status === "completed" ? "Agent execution completed." : outcome.errorMessage,
  });

  if (closed.kind === "team" && closed.actorName && closed.actorRole) {
    new TeamStore(input.rootDir).upsertMember({
      name: closed.actorName,
      role: closed.actorRole,
      status: "idle",
      executionId: closed.id,
      sessionId: closed.sessionId,
      pid: closed.pid,
    });
  }
}
