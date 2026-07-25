import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runAgentTurn } from "../agent/turn.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { isLeaseOwnershipLostError, type LeaseOwnershipLostError } from "../control/lease.js";
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
import { finalizeOwnedTurn, loadLatestTurnSession } from "./turnFinalization.js";

export const PRESERVE_QUEUED_TURN_ABORT_REASON = "Preserve accepted queued turn for restart.";
export const PRESERVE_ACTIVE_TURN_ABORT_REASON = "Detach active turn for durable recovery.";

class QueuedTurnDetachedError extends Error {}

interface HostTurnOutcomeCandidate extends HostTurnOutcome {
  details?: Record<string, unknown>;
}

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
  let heartbeatTimer: NodeJS.Timeout | undefined;
  const leaseAbortController = new AbortController();
  const turnAbortSignal = AbortSignal.any([
    leaseAbortController.signal,
    ...(options.abortSignal ? [options.abortSignal] : []),
  ]);

  const settleOutcome = async (
    candidate: HostTurnOutcomeCandidate,
    settleOptions: { skipFinalization?: boolean; ownershipLoss?: LeaseOwnershipLostError } = {},
  ): Promise<HostTurnOutcome> => {
    let outcome = candidate;
    let eventError = candidate.error;
    let ownershipLoss = settleOptions.ownershipLoss;

    if (turnRecord?.ownerToken && !settleOptions.skipFinalization) {
      try {
        const committedSession = finalizeOwnedTurn({
          rootDir: stateRootDir,
          session: candidate.session,
          turnId: turnRecord.id,
          ownerToken: turnRecord.ownerToken,
          ownerGeneration: turnRecord.ownerGeneration,
          status: candidate.status,
          error: candidate.status === "completed" || !candidate.error
            ? undefined
            : getErrorMessage(candidate.error),
        });
        outcome = {
          ...candidate,
          session: committedSession,
          result: candidate.result ? { ...candidate.result, session: committedSession } : undefined,
        };
        session = committedSession;
      } catch (error) {
        ownershipLoss = findLeaseOwnershipLoss(error);
        eventError = error;
        if (ownershipLoss) {
          const latestSession = safelyLoadLatestTurnSession(stateRootDir, candidate.session);
          session = latestSession;
          outcome = {
            status: "aborted",
            session: latestSession,
            error: ownershipLoss,
            errorMessage: translate(options.config.locale, "interaction.detachedRecovery"),
            details: { ownershipLost: true },
          };
        } else {
          outcome = {
            status: "failed",
            session: candidate.session,
            error,
            errorMessage: translate(options.config.locale, "interaction.requestFailed"),
            details: { finalizationFailed: true },
          };
        }
      }
    } else if (ownershipLoss) {
      const latestSession = safelyLoadLatestTurnSession(stateRootDir, candidate.session);
      session = latestSession;
      outcome = {
        status: "aborted",
        session: latestSession,
        error: ownershipLoss,
        errorMessage: translate(options.config.locale, "interaction.detachedRecovery"),
        details: { ownershipLost: true },
      };
      eventError = ownershipLoss;
    }

    if (turnRecord) {
      await recordHostTurnFinished(stateRootDir, {
        host,
        sessionId: outcome.session.id,
        turnId: turnRecord.id,
        status: outcome.status,
        durationMs: Date.now() - startedAt,
        cwd: options.cwd,
        error: eventError,
        details: outcome.details,
      });
    }
    await appendTerminalSessionEvent(
      sessionEvents,
      outcome,
      options.cwd,
      host,
    ).catch(() => undefined);

    const { details: _details, ...publicOutcome } = outcome;
    return publicOutcome;
  };

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
        const status = settled?.status === "completed"
          ? "completed"
          : settled?.status === "aborted" ? "aborted" : "failed";
        return {
          status,
          session: settledSession,
          errorMessage: status === "failed"
            ? translate(options.config.locale, "interaction.requestFailed")
            : status === "aborted"
              ? translate(options.config.locale, "interaction.turnInterrupted")
              : undefined,
        };
      } finally {
        existing.close();
      }
    }
    await recordHostTurnStarted(stateRootDir, {
      host,
      sessionId: options.session.id,
      turnId: turnRecord.id,
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
      return settleOutcome({
        status: "aborted",
        session: options.session,
        errorMessage: translate(options.config.locale, "interaction.turnInterrupted"),
      });
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
      cwd: options.cwd,
      stateRootDir,
    });

    if (options.abortSignal?.aborted) {
      return settleOutcome({
        status: "aborted",
        session,
        errorMessage: translate(options.config.locale, "interaction.turnInterrupted"),
      });
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

    return settleOutcome({
      status: "completed",
      session: result.session,
      result,
      details: {
        changedPathCount: result.changedPaths.length,
      },
    });
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
      } catch (detachError) {
        const ownershipLoss = findLeaseOwnershipLoss(detachError);
        if (ownershipLoss) {
          return settleOutcome({
            status: "aborted",
            session: failedSession,
            error: ownershipLoss,
            errorMessage: translate(options.config.locale, "interaction.detachedRecovery"),
          }, { skipFinalization: true, ownershipLoss });
        }
        return settleOutcome({
          status: "failed",
          session: failedSession,
          error: detachError,
          errorMessage: translate(options.config.locale, "interaction.requestFailed"),
          details: { finalizationFailed: true },
        });
      } finally {
        recoveryLedger.close();
      }
      return settleOutcome({
        status: "aborted",
        session: failedSession,
        error,
        errorMessage: translate(options.config.locale, "interaction.detachedRecovery"),
      }, { skipFinalization: true });
    }
    const ownershipLoss = findLeaseOwnershipLoss(error)
      ?? findLeaseOwnershipLoss(leaseAbortController.signal.reason);
    if (ownershipLoss) {
      return settleOutcome({
        status: "aborted",
        session: failedSession,
        error: ownershipLoss,
        errorMessage: translate(options.config.locale, "interaction.detachedRecovery"),
      }, { skipFinalization: true, ownershipLoss });
    }
    if (isAbortError(error)) {
      return settleOutcome({
        status: "aborted",
        session: failedSession,
        error,
        errorMessage: translate(options.config.locale, "interaction.turnInterrupted"),
      });
    }

    return settleOutcome({
      status: "failed",
      session: failedSession,
      error,
      errorMessage: getErrorMessage(error),
    });
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
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

async function appendTerminalSessionEvent(
  events: SessionEventStore,
  outcome: HostTurnOutcomeCandidate,
  cwd: string,
  host: string,
): Promise<void> {
  if (outcome.status === "aborted") {
    await appendTurnAbortedEvent(events, outcome.session.id, cwd, host);
    return;
  }
  if (outcome.status === "failed") {
    await events.append({
      type: "turn.failed",
      sessionId: outcome.session.id,
      cwd,
      host,
      message: outcome.error ? getErrorMessage(outcome.error) : outcome.errorMessage,
    });
    return;
  }
  await events.append({
    type: "turn.completed",
    sessionId: outcome.session.id,
    cwd,
    host,
    details: outcome.details,
  });
}

function findLeaseOwnershipLoss(error: unknown): LeaseOwnershipLostError | undefined {
  if (isLeaseOwnershipLostError(error)) return error;
  if (typeof error !== "object" || error === null) return undefined;
  if (error instanceof AggregateError) {
    for (const nested of error.errors) {
      const ownershipLoss = findLeaseOwnershipLoss(nested);
      if (ownershipLoss) return ownershipLoss;
    }
  }
  if ("cause" in error) {
    return findLeaseOwnershipLoss((error as { cause?: unknown }).cause);
  }
  return undefined;
}

function safelyLoadLatestTurnSession(rootDir: string, fallback: SessionRecord): SessionRecord {
  try {
    return loadLatestTurnSession(rootDir, fallback.id, fallback);
  } catch {
    return fallback;
  }
}
