import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runAgentTurn } from "../agent/turn.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { enterCrashContext } from "../observability/crashRecorder.js";
import { recordHostTurnFinished, recordHostTurnStarted } from "../observability/hostEvents.js";
import { SessionEventStore } from "../session/events.js";
import { isAbortError, sleepWithSignal, throwIfAborted } from "../utils/abort.js";
import { createHostToolRegistry } from "./toolRegistry.js";
import type { HostTurnDependencies, HostTurnOptions, HostTurnOutcome } from "./types.js";
import type { SessionRecord } from "../types.js";
import { consumePendingTurnSteers } from "../agent/turn/steering.js";
import { translate } from "../i18n/index.js";
import { createTurnScopedSessionStore } from "./turnSessionStore.js";

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
  let turnRecord: { id: string; input: string; ownerToken?: string; ownerGeneration: number } | undefined;
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
          ledger.turns.heartbeat(turnRecord!.id, turnRecord!.ownerToken!, turnRecord!.ownerGeneration);
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

    const turnSessionStore = turnRecord?.ownerToken
      ? createTurnScopedSessionStore(options.sessionStore, {
          rootDir: stateRootDir,
          sessionId: session.id,
          turnId: turnRecord.id,
          ownerToken: turnRecord.ownerToken,
          ownerGeneration: turnRecord.ownerGeneration,
        })
      : options.sessionStore;
    dependencies.onRunTurnStarted?.();
    const result = await runTurn({
      input: turnRecord.input,
      cwd: options.cwd,
      stateRootDir,
      config: options.config,
      session,
      sessionStore: turnSessionStore,
      inputSource: "external",
      turnId: turnRecord.id,
      turnOwnerToken: turnRecord.ownerToken,
      turnOwnerGeneration: turnRecord.ownerGeneration,
      ownerSessionId: session.id,
      abortSignal: turnAbortSignal,
      callbacks: options.callbacks,
      toolRegistry,
      runtimePromptState: options.runtimePromptState,
      steering: turnRecord.ownerToken ? {
        consumePending: async (currentSession) => {
          const consumed = await consumePendingTurnSteers({
            rootDir: stateRootDir,
            turnId: turnRecord!.id,
            ownerToken: turnRecord!.ownerToken!,
            ownerGeneration: turnRecord!.ownerGeneration,
            session: currentSession,
            sessionStore: turnSessionStore,
          });
          return { session: consumed.session, inputs: consumed.steers.map((steer) => steer.input) };
        },
        beginClosing: async () => {
          const ledger = new ControlPlaneLedger(stateRootDir);
          try { return ledger.turns.beginClosing(turnRecord!.id, turnRecord!.ownerToken!, turnRecord!.ownerGeneration); }
          finally { ledger.close(); }
        },
      } : undefined,
    });
    session = result.session;

    if (turnRecord.ownerToken) {
      const closingLedger = new ControlPlaneLedger(stateRootDir);
      try {
        if (!closingLedger.turns.beginClosing(turnRecord.id, turnRecord.ownerToken, turnRecord.ownerGeneration)) {
          throw new Error("Turn runner returned while user guidance was still pending.");
        }
      } finally {
        closingLedger.close();
      }
    }

    await recordHostTurnFinished(stateRootDir, {
      host,
      sessionId: result.session.id,
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
    session = failedSession;
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
          turnRecord.ownerGeneration,
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
      const ownedTurn = {
        id: turnRecord.id,
        ownerToken: turnRecord.ownerToken,
        ownerGeneration: turnRecord.ownerGeneration,
      };
      const ledger = new ControlPlaneLedger(stateRootDir);
      try {
        ledger.transaction(() => {
          const committedSession = ledger.sessions.saveOwned({
            session,
            turnId: ownedTurn.id,
            ownerToken: ownedTurn.ownerToken,
            ownerGeneration: ownedTurn.ownerGeneration,
          });
          Object.assign(session, committedSession);
          if (terminalStatus === "aborted" || terminalStatus === "failed") {
            ledger.turnSteers.rejectPending(
              ownedTurn.id,
              terminalStatus === "aborted" ? "The current turn was interrupted." : "The current turn failed.",
            );
          }
          ledger.turns.finish(
            ownedTurn.id,
            ownedTurn.ownerToken,
            ownedTurn.ownerGeneration,
            terminalStatus ?? "failed",
          );
        });
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
}): Promise<{ id: string; input: string; ownerToken?: string; ownerGeneration: number }> {
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
        return { id: claimed.id, input: claimed.input, ownerToken: claimed.ownerToken, ownerGeneration: claimed.ownerGeneration };
      }
      const observed = current.turns.load(admitted.id);
      if (observed && ["completed", "failed", "aborted"].includes(observed.status)) {
        return { id: observed.id, input: observed.input, ownerGeneration: observed.ownerGeneration };
      }
    } finally {
      current.close();
    }
    await sleepWithSignal(50, input.abortSignal);
  }
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
