import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runAgentTurn } from "../agent/turn.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { buildLeadWakeFacts, waitForLeadWaitExecutions } from "../execution/leadWait.js";
import { createLeadWaitRuntimeUiStreamer } from "../execution/leadWaitRuntimeUi.js";
import { completeExactDelegatedCloseout } from "./delegatedCloseout.js";
import { enterCrashContext } from "../observability/crashRecorder.js";
import { recordHostTurnFinished, recordHostTurnStarted } from "../observability/hostEvents.js";
import { createRuntimeUiEvent } from "../runtime-ui/events.js";
import { SessionEventStore } from "../session/events.js";
import { isAbortError, sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import { createHostToolRegistry } from "./toolRegistry.js";
import type { HostTurnDependencies, HostTurnOptions, HostTurnOutcome } from "./types.js";
import type { ToolRegistry } from "../tools/core/types.js";
import type { SessionRecord } from "../types.js";
import { runWithTurnOwnership } from "../control/turnOwnership.js";
import { consumePendingTurnSteers } from "../agent/turn/steering.js";
import { translate } from "../i18n/index.js";

const DEFAULT_IDENTITY = {
  kind: "lead" as const,
  name: "lead",
};

export const PRESERVE_QUEUED_TURN_ABORT_REASON = "Preserve accepted queued turn for restart.";
export const PRESERVE_ACTIVE_TURN_ABORT_REASON = "Detach active turn for durable recovery.";

class QueuedTurnDetachedError extends Error {}

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
  let session = options.session;
  let turnRecord: { id: string; input: string; ownerToken?: string } | undefined;
  let terminalStatus: "completed" | "failed" | "aborted" | undefined;
  let detachedForRecovery = false;
  let heartbeatTimer: NodeJS.Timeout | undefined;
  const leaseAbortController = new AbortController();
  const turnAbortSignal = AbortSignal.any([
    leaseAbortController.signal,
    ...(options.abortSignal ? [options.abortSignal] : []),
  ]);

  try {
    turnRecord = await claimTurn({
      rootDir: stateRootDir,
      sessionId: options.session.id,
      input: options.input,
      inputSource: "external",
      admittedTurnId: options.admittedTurnId,
      abortSignal: turnAbortSignal,
      session: options.session,
    });
    if (!turnRecord.ownerToken) {
      const existing = new ControlPlaneLedger(stateRootDir);
      try {
        const settled = existing.turns.load(turnRecord.id);
        const settledSession = existing.sessions.load(options.session.id) ?? options.session;
        return {
          status: settled?.status === "completed" ? "completed" : settled?.status === "aborted" ? "aborted" : "failed",
          session: settledSession,
          errorMessage: settled?.error,
        };
      } finally {
        existing.close();
      }
    }
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
      message: turnRecord.input,
    });
    if (options.abortSignal?.aborted) {
      terminalStatus = "aborted";
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
        errorMessage: translate(options.config.locale, "interaction.turnInterrupted"),
      };
    }

    try {
      session = await options.sessionStore.load(options.session.id);
    } catch {
      session = await options.sessionStore.save(options.session);
    }
    if (turnRecord.ownerToken) {
      heartbeatTimer = setInterval(() => {
        const ledger = new ControlPlaneLedger(stateRootDir);
        try {
          ledger.turns.heartbeat(turnRecord!.id, turnRecord!.ownerToken!);
        } catch (error) {
          leaseAbortController.abort(error);
        } finally {
          ledger.close();
        }
      }, 10_000);
      heartbeatTimer.unref();
    }
    toolRegistry = await createToolRegistry(options.config, {
      builtinToolFilter: options.builtinToolFilter,
      extraTools: options.extraTools,
    });

    if (options.abortSignal?.aborted) {
      terminalStatus = "aborted";
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
        session,
        errorMessage: translate(options.config.locale, "interaction.turnInterrupted"),
      };
    }

    let nextInput = turnRecord.input;
    let runtimePromptState = options.runtimePromptState;
    let wakeCloseoutTurn = false;
    let result: Awaited<ReturnType<typeof runTurn>>;
    for (;;) {
      const runTurnOperation = () => runTurn({
        input: nextInput,
        cwd: options.cwd,
        stateRootDir,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        inputSource: wakeCloseoutTurn ? "internal" : "external",
        turnId: turnRecord?.id,
        turnOwnerToken: turnRecord?.ownerToken,
        abortSignal: turnAbortSignal,
        callbacks: options.callbacks,
        toolRegistry: wakeCloseoutTurn ? createToollessRegistry(toolRegistry!) : toolRegistry!,
        identity: options.identity ?? DEFAULT_IDENTITY,
        runtimePromptState,
        steering: turnRecord?.ownerToken ? {
          consumePending: async (currentSession) => {
            const consumed = await consumePendingTurnSteers({
              rootDir: stateRootDir,
              turnId: turnRecord!.id,
              ownerToken: turnRecord!.ownerToken!,
              session: currentSession,
              sessionStore: options.sessionStore,
            });
            return {
              session: consumed.session,
              inputs: consumed.steers.map((steer) => steer.input),
            };
          },
          beginClosing: async () => {
            const ledger = new ControlPlaneLedger(stateRootDir);
            try {
              return ledger.turns.beginClosing(turnRecord!.id, turnRecord!.ownerToken!);
            } finally {
              ledger.close();
            }
          },
        } : undefined,
      });
      dependencies.onRunTurnStarted?.();
      const resultPromise = turnRecord?.ownerToken
        ? runWithTurnOwnership({
            rootDir: stateRootDir,
            sessionId: session.id,
            turnId: turnRecord.id,
            ownerToken: turnRecord.ownerToken,
          }, runTurnOperation)
        : runTurnOperation();
      result = await resultPromise;
      session = result.session;

      const transition = result.transition;
      const isLead = (options.identity ?? DEFAULT_IDENTITY).kind === "lead";
      if (!isLead || transition?.action !== "yield" || transition.reason.code !== "yield.execution_wait") {
        break;
      }

      options.callbacks?.onStatus?.(translate(options.config.locale, "runtime.waitingDelegated"));
      const streamLeadWaitEvents = createLeadWaitRuntimeUiStreamer({
        events: sessionEvents,
        callbacks: options.callbacks,
      });
      const executions = await waitForLeadWaitExecutions({
        rootDir: stateRootDir,
        executionIds: transition.reason.executionIds,
        abortSignal: turnAbortSignal,
        onPoll: streamLeadWaitEvents,
      });
      await streamLeadWaitEvents(executions);
      options.callbacks?.onRuntimeUiEvent?.(createRuntimeUiEvent({
        channel: "lead",
        kind: "status",
        message: translate(options.config.locale, "runtime.resumedDelegated"),
      }));
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

    if (turnRecord.ownerToken) {
      const closingLedger = new ControlPlaneLedger(stateRootDir);
      try {
        if (!closingLedger.turns.beginClosing(turnRecord.id, turnRecord.ownerToken)) {
          throw new Error("Turn runner returned while user guidance was still pending.");
        }
      } finally {
        closingLedger.close();
      }
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

    terminalStatus = "completed";
    return {
      status: "completed",
      session: result.session,
      result,
    };
  } catch (error) {
    const failedSession = error instanceof AgentTurnError ? error.session : session;
    if (error instanceof QueuedTurnDetachedError) {
      return {
        status: "aborted",
        session: failedSession,
        error,
        errorMessage: translate(options.config.locale, "interaction.queuedRestart"),
      };
    }
    if (options.abortSignal?.reason === PRESERVE_ACTIVE_TURN_ABORT_REASON && turnRecord?.ownerToken) {
      const recoveryLedger = new ControlPlaneLedger(stateRootDir);
      try {
        recoveryLedger.turns.detachForRecovery(
          turnRecord.id,
          turnRecord.ownerToken,
          "Host detached while the turn was active. Resume from durable session and tool facts.",
        );
        detachedForRecovery = true;
      } finally {
        recoveryLedger.close();
      }
      return {
        status: "aborted",
        session: failedSession,
        error,
        errorMessage: translate(options.config.locale, "interaction.detachedRecovery"),
      };
    }
    if (isAbortError(error)) {
      terminalStatus = "aborted";
      await recordHostTurnFinished(stateRootDir, {
        host,
        sessionId: failedSession.id,
        identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
        identityName: (options.identity ?? DEFAULT_IDENTITY).name,
        status: "aborted",
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
        error,
      });
      await appendTurnAbortedEvent(sessionEvents, failedSession.id, options.cwd, host);
      return {
        status: "aborted",
        session: failedSession,
        error,
        errorMessage: translate(options.config.locale, "interaction.turnInterrupted"),
      };
    }

    await recordHostTurnFinished(stateRootDir, {
      host,
      sessionId: failedSession.id,
      identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
      identityName: (options.identity ?? DEFAULT_IDENTITY).name,
      status: "failed",
      durationMs: Date.now() - startedAt,
      cwd: options.cwd,
      error,
    });
    await sessionEvents.append({
      type: "turn.failed",
      sessionId: failedSession.id,
      cwd: options.cwd,
      host,
      message: getErrorMessage(error),
    });
    terminalStatus = "failed";
    return {
      status: "failed",
      session: failedSession,
      error,
      errorMessage: getErrorMessage(error),
    };
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    if (turnRecord?.ownerToken && !detachedForRecovery) {
      const ledger = new ControlPlaneLedger(stateRootDir);
      try {
        if (terminalStatus === "aborted" || terminalStatus === "failed") {
          ledger.turnSteers.rejectPending(
            turnRecord.id,
            terminalStatus === "aborted" ? "The current turn was interrupted." : "The current turn failed.",
          );
        }
        ledger.turns.finish(turnRecord.id, turnRecord.ownerToken, terminalStatus ?? "failed");
      } catch {
        // The lease may have expired and been recovered by another host.
      } finally {
        ledger.close();
      }
    }
    releaseCrashContext();
    await toolRegistry?.close?.().catch(() => undefined);
  }
}

async function claimTurn(input: {
  rootDir: string;
  sessionId: string;
  input: string;
  inputSource: "external" | "internal";
  admittedTurnId?: string;
  abortSignal?: AbortSignal;
  session: SessionRecord;
}): Promise<{ id: string; input: string; ownerToken?: string }> {
  const ledger = new ControlPlaneLedger(input.rootDir);
  let admitted;
  try {
    if (!ledger.sessions.load(input.sessionId)) ledger.sessions.save(input.session);
    admitted = input.admittedTurnId
      ? ledger.turns.load(input.admittedTurnId)
      : ledger.turns.admit({
          sessionId: input.sessionId,
          input: input.input,
          inputSource: input.inputSource,
        });
    if (!admitted || admitted.sessionId !== input.sessionId) {
      throw new Error(`Pending turn ${input.admittedTurnId ?? "unknown"} does not belong to session ${input.sessionId}.`);
    }
  } finally {
    ledger.close();
  }
  for (;;) {
    if (input.abortSignal?.aborted) {
      if (input.abortSignal.reason === PRESERVE_QUEUED_TURN_ABORT_REASON) {
        throw new QueuedTurnDetachedError(PRESERVE_QUEUED_TURN_ABORT_REASON);
      }
      const aborted = new ControlPlaneLedger(input.rootDir);
      try {
        aborted.turns.abortQueued(admitted.id);
      } finally {
        aborted.close();
      }
      throwIfAborted(input.abortSignal, "Turn admission aborted.");
    }
    const current = new ControlPlaneLedger(input.rootDir);
    try {
      const claimed = current.turns.claim(admitted.id);
      if (claimed) {
        return { id: claimed.id, input: claimed.input, ownerToken: claimed.ownerToken };
      }
      const observed = current.turns.load(admitted.id);
      if (observed && ["completed", "failed", "aborted"].includes(observed.status)) {
        return { id: observed.id, input: observed.input };
      }
    } finally {
      current.close();
    }
    await sleepWithSignal(50, input.abortSignal);
  }
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
