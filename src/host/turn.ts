import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runAgentTurn } from "../agent/turn.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { buildLeadWakeFacts, waitForLeadWaitExecutions } from "../execution/leadWait.js";
import { enterCrashContext } from "../observability/crashRecorder.js";
import { recordHostTurnFinished, recordHostTurnStarted } from "../observability/hostEvents.js";
import { SessionEventStore } from "../session/events.js";
import { createMessage } from "../session/messages.js";
import { isAbortError } from "../utils/abort.js";
import { createHostToolRegistry } from "./toolRegistry.js";
import type { HostTurnDependencies, HostTurnOptions, HostTurnOutcome } from "./types.js";
import { buildRunTurnResult, createFinalizeTransition } from "../agent/runtimeTransition.js";
import { noteCheckpointCompleted } from "../session/checkpoint.js";
import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
import type { ToolRegistry } from "../tools/core/types.js";

const DEFAULT_IDENTITY = {
  kind: "lead" as const,
  name: "lead",
};

export async function runHostTurn(
  options: HostTurnOptions,
  dependencies: HostTurnDependencies = {},
): Promise<HostTurnOutcome> {
  const stateRootDir = options.stateRootDir ?? await readStateRootDir(options.cwd);
  const host = options.host ?? "unknown";
  const startedAt = Date.now();
  const releaseCrashContext = enterCrashContext({
    host,
    sessionId: options.session.id,
  });
  const createToolRegistry = dependencies.createToolRegistry ?? createHostToolRegistry;
  const runTurn = dependencies.runTurn ?? runAgentTurn;
  const sessionEvents = new SessionEventStore(options.config.paths.eventsDir);
  let toolRegistry: Awaited<ReturnType<typeof createToolRegistry>> | null = null;

  await recordHostTurnStarted(stateRootDir, {
    host,
    sessionId: options.session.id,
    identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
    identityName: (options.identity ?? DEFAULT_IDENTITY).name,
    cwd: options.cwd,
  });
  await sessionEvents.append({
    type: "turn.started",
    sessionId: options.session.id,
    cwd: options.cwd,
    host,
    message: options.input,
  });

  try {
    if (options.abortSignal?.aborted) {
      await recordHostTurnFinished(stateRootDir, {
        host,
        sessionId: options.session.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
      });
      await appendTurnAbortedEvent(sessionEvents, options.session.id, options.cwd, host);
      return {
        status: "aborted",
        session: options.session,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    toolRegistry = await createToolRegistry(options.config, {
      builtinToolFilter: options.builtinToolFilter,
      extraTools: options.extraTools,
    });

    if (options.abortSignal?.aborted) {
      await recordHostTurnFinished(stateRootDir, {
        host,
        sessionId: options.session.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
      });
      await appendTurnAbortedEvent(sessionEvents, options.session.id, options.cwd, host);
      return {
        status: "aborted",
        session: options.session,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    let nextInput = options.input;
    let session = options.session;
    let runtimePromptState = options.runtimePromptState;
    let wakeCloseoutTurn = false;
    let result: Awaited<ReturnType<typeof runTurn>>;
    for (;;) {
      const resultPromise = runTurn({
        input: nextInput,
        cwd: options.cwd,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        abortSignal: options.abortSignal,
        callbacks: options.callbacks,
        toolRegistry: wakeCloseoutTurn ? createToollessRegistry(toolRegistry) : toolRegistry,
        identity: options.identity ?? DEFAULT_IDENTITY,
        runtimePromptState,
      });
      dependencies.onRunTurnStarted?.();
      result = await resultPromise;
      session = result.session;

      const transition = result.transition;
      const isLead = (options.identity ?? DEFAULT_IDENTITY).kind === "lead";
      if (!isLead || transition?.action !== "yield" || transition.reason.code !== "yield.execution_wait") {
        break;
      }

      options.callbacks?.onStatus?.("Lead yielded. Waiting for delegated execution wake signal.");
      const executions = await waitForLeadWaitExecutions({
        rootDir: stateRootDir,
        executionIds: transition.reason.executionIds,
        abortSignal: options.abortSignal,
      });
      const lifecycleLedger = new ControlPlaneLedger(stateRootDir);
      try {
        lifecycleLedger.taskLifecycle.update({
          sessionId: session.id,
          stage: "normal_work",
          reason: "wake.execution_settled",
          activeExecutionIds: [],
          completionFacts: executions
            .map((execution) => execution.output ?? execution.summary)
            .filter((fact): fact is string => Boolean(fact)),
        });
      } finally {
        lifecycleLedger.close();
      }
      const wakeFacts = buildLeadWakeFacts(executions);
      const directCloseout = await completeExactDelegatedCloseout({
        session,
        sessionStore: options.sessionStore,
        stateRootDir,
        callbacks: options.callbacks,
        executions,
      });
      if (directCloseout) {
        result = directCloseout;
        session = directCloseout.session;
        break;
      }
      nextInput = wakeFacts.userInput;
      wakeCloseoutTurn = true;
      runtimePromptState = {
        ...(runtimePromptState ?? {}),
        turnPhase: "delegated_closeout",
        internalFactBlocks: [
          ...(runtimePromptState?.internalFactBlocks ?? []),
          wakeFacts.promptBlock,
        ],
      };
    }

    await recordHostTurnFinished(stateRootDir, {
      host,
      sessionId: result.session.id,
      identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
      identityName: (options.identity ?? DEFAULT_IDENTITY).name,
      status: "completed",
      durationMs: Date.now() - startedAt,
      cwd: options.cwd,
      details: {
        changedPathCount: result.changedPaths.length,
      },
    });
    await sessionEvents.append({
      type: "turn.completed",
      sessionId: result.session.id,
      cwd: options.cwd,
      host,
      details: {
        changedPathCount: result.changedPaths.length,
      },
    });

    return {
      status: "completed",
      session: result.session,
      result,
    };
  } catch (error) {
    const session = error instanceof AgentTurnError ? error.session : options.session;
    if (isAbortError(error)) {
      await recordHostTurnFinished(stateRootDir, {
        host,
        sessionId: session.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
        error,
      });
      await appendTurnAbortedEvent(sessionEvents, session.id, options.cwd, host);
      return {
        status: "aborted",
        session,
        error,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    await recordHostTurnFinished(stateRootDir, {
      host,
      sessionId: session.id,
      identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
      identityName: (options.identity ?? DEFAULT_IDENTITY).name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      cwd: options.cwd,
      error,
    });
    await sessionEvents.append({
      type: "turn.failed",
      sessionId: session.id,
      cwd: options.cwd,
      host,
      message: getErrorMessage(error),
    });
    return {
      status: "failed",
      session,
      error,
      errorMessage: getErrorMessage(error),
    };
  } finally {
    releaseCrashContext();
    await toolRegistry?.close?.().catch(() => undefined);
  }
}

async function completeExactDelegatedCloseout(input: {
  session: HostTurnOptions["session"];
  sessionStore: HostTurnOptions["sessionStore"];
  stateRootDir: string;
  callbacks?: AgentCallbacks;
  executions: Awaited<ReturnType<typeof waitForLeadWaitExecutions>>;
}): Promise<RunTurnResult | undefined> {
  const answer = resolveExactDelegatedAnswer(input.executions);
  if (!answer) {
    return undefined;
  }

  const transition = createFinalizeTransition({
    changedPaths: [],
  });
  const sessionWithAnswer = await input.sessionStore.appendMessages(input.session, [
    createMessage("assistant", answer),
  ]);
  const session = await input.sessionStore.save(noteCheckpointCompleted(sessionWithAnswer, transition));
  const ledger = new ControlPlaneLedger(input.stateRootDir);
  try {
    ledger.taskLifecycle.complete({
      sessionId: session.id,
      reason: "finalize.delegated_exact_output",
      completionFacts: [answer],
    });
  } finally {
    ledger.close();
  }
  input.callbacks?.onAssistantText?.(answer);
  input.callbacks?.onAssistantDone?.(answer);
  return buildRunTurnResult({
    session,
    changedPaths: [],
    transition,
  });
}

function resolveExactDelegatedAnswer(executions: readonly { assignment?: { expectedOutput?: string }; output?: string; status: string }[]): string | undefined {
  if (executions.length !== 1) {
    return undefined;
  }
  const [execution] = executions;
  if (!execution || execution.status !== "completed") {
    return undefined;
  }
  const expected = execution.assignment?.expectedOutput?.trim();
  const output = execution.output?.trim();
  if (!expected || !output || expected !== output) {
    return undefined;
  }
  return output;
}

function createToollessRegistry(registry: ToolRegistry): ToolRegistry {
  return {
    ...registry,
    definitions: [],
    entries: [],
  };
}

async function readStateRootDir(cwd: string): Promise<string> {
  try {
    return (await resolveProjectRoots(cwd)).stateRootDir;
  } catch {
    return cwd;
  }
}

async function appendTurnAbortedEvent(
  events: SessionEventStore,
  sessionId: string,
  cwd: string,
  host: string,
): Promise<void> {
  await events.append({
    type: "turn.aborted",
    sessionId,
    cwd,
    host,
    message: "Turn interrupted.",
  });
}
