import { createSessionStore } from "../cli/commands/sessionHelpers.js";
import { runHostTurn } from "../host/turn.js";
import { createHostSession } from "../host/session.js";
import { createRuntimeUiEvent, type RuntimeUiEvent } from "../runtime-ui/events.js";
import { SessionEventStore } from "../session/events.js";
import type { RuntimeConfig } from "../types.js";
import type { AgentCallbacks } from "../agent/types.js";
import { isAgentWorkerExecutionKind, toAgentWorkerIdentityKind } from "./kinds.js";
import { executionKindMismatch, unknownExecution } from "./errors.js";
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
    throw unknownExecution(input.executionId);
  }
  if (!isAgentWorkerExecutionKind(execution.kind)) {
    throw executionKindMismatch(execution.id, execution.kind, "subagent");
  }

  const sessionStore = await createSessionStore(input.config.paths.sessionsDir);
  const session = await createHostSession(sessionStore, execution.cwd || input.cwd);
  store.markRunning(execution.id, {
    pid: process.pid,
    sessionId: session.id,
  });
  const eventBackedCallbacks = createWorkerRuntimeUiCallbacks({
    config: input.config,
    cwd: execution.cwd || input.cwd,
    executionId: execution.id,
    sessionId: session.id,
    actorName: execution.actorName ?? execution.kind,
  });

  const runTurn = input.runTurn ?? runHostTurn;
  let outcome: Awaited<ReturnType<typeof runTurn>>;
  try {
    outcome = await runTurn({
      host: execution.kind,
      input: execution.prompt ?? "",
      cwd: execution.cwd || input.cwd,
      stateRootDir: input.rootDir,
      config: input.config,
      session,
      sessionStore,
      callbacks: eventBackedCallbacks.callbacks,
      identity: {
        kind: toAgentWorkerIdentityKind(execution.kind),
        name: execution.actorName ?? execution.kind,
        role: execution.actorRole,
      },
    });
  } finally {
    await eventBackedCallbacks.flush();
  }

  const status = outcome.status === "completed" ? "completed" : outcome.status === "aborted" ? "aborted" : "failed";
  const workerAnswer = outcome.status === "completed"
    ? readLastAssistantText(outcome.result?.session ?? outcome.session)
    : undefined;
  const closed = store.close(execution.id, {
    status,
    summary: workerAnswer ?? outcome.status,
    resultText: workerAnswer ?? (outcome.status === "completed" ? "Agent execution completed." : outcome.errorMessage),
    changedPaths: outcome.result?.changedPaths ?? [],
    closeReason: outcome.status,
    error: outcome.status === "failed" ? outcome.errorMessage : undefined,
  });

}

function createWorkerRuntimeUiCallbacks(input: {
  config: RuntimeConfig;
  cwd: string;
  executionId: string;
  sessionId: string;
  actorName: string;
}): { callbacks: AgentCallbacks; flush: () => Promise<void> } {
  const sessionEvents = new SessionEventStore(input.config.paths.eventsDir);
  let pending = Promise.resolve();
  const append = (event: RuntimeUiEvent): void => {
    pending = pending
      .then(() => sessionEvents.append({
        type: "runtime.ui",
        sessionId: input.sessionId,
        cwd: input.cwd,
        host: "subagent",
        details: {
          runtimeUiEvent: event,
        },
      }))
      .then(() => undefined, () => undefined);
  };
  const emit = (event: Omit<RuntimeUiEvent, "protocol" | "createdAt" | "channel" | "actor" | "executionId">): void => {
    append(createRuntimeUiEvent({
      channel: "subagent",
      actor: input.actorName,
      executionId: input.executionId,
      ...event,
    }));
  };

  return {
    async flush() {
      await pending;
    },
    callbacks: {
      onReasoningDelta(delta) {
        emit({ kind: "reasoning", message: delta });
      },
      onReasoning(text) {
        emit({ kind: "reasoning", message: `${text}\n` });
      },
      onAssistantDelta(delta) {
        emit({ kind: "assistant_text", message: delta });
      },
      onAssistantStage(text) {
        emit({ kind: "assistant_text", message: text });
      },
      onAssistantText(text) {
        emit({ kind: "assistant_text", message: text });
      },
      onToolCall(name, args) {
        emit({ kind: "tool_call", toolName: name, payload: args });
      },
      onToolResult(name, output) {
        emit({ kind: "tool_result", toolName: name, payload: output, ok: true });
      },
      onToolError(name, error) {
        emit({ kind: "tool_error", toolName: name, payload: error, ok: false, level: "error" });
      },
      onStatus(text) {
        emit({ kind: "status", message: text });
      },
    },
  };
}

function readLastAssistantText(session: { messages: Array<{ role: string; content: string | null }> }): string | undefined {
  for (let index = session.messages.length - 1; index >= 0; index -= 1) {
    const message = session.messages[index];
    if (message?.role !== "assistant") {
      continue;
    }
    const content = message.content?.trim();
    if (content) {
      return content;
    }
  }
  return undefined;
}
