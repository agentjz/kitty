import { getErrorMessage } from "../agent/errors.js";
import process from "node:process";
import type { SessionStoreLike } from "../session/index.js";
import {
  PRESERVE_ACTIVE_TURN_ABORT_REASON,
  PRESERVE_QUEUED_TURN_ABORT_REASON,
  runHostTurn,
} from "../host/turn.js";
import type { HostTurnRunner } from "../host/types.js";
import type { PromptRuntimeState } from "../agent/prompt/types.js";
import type { RegisteredTool, ToolFilter } from "../tools/core/types.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { defaultInteractiveExitGuard, type InteractiveExitGuard } from "./exitGuard.js";
import { handleLocalCommand, type LocalCommandResult } from "./localCommands.js";
import { normalizeLocalCommand } from "./localCommandDefinitions.js";
import { notifyBackgroundWaitersForConsumer } from "../execution/backgroundSignals.js";
import type { InteractionShell } from "./shell.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { translate, type MessageKey } from "../i18n/index.js";

export interface InteractiveTurnContext {
  cwd?: string;
  builtinToolFilter?: ToolFilter;
  extraTools?: readonly RegisteredTool[];
  runtimePromptState?: Partial<PromptRuntimeState>;
}

export interface InteractiveSessionDriverOptions {
  cwd: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  shell: InteractionShell;
  exitGuard?: InteractiveExitGuard;
  runTurn?: HostTurnRunner;
  localCommandHandler?: typeof handleLocalCommand;
  turnContextProvider?: (session: SessionRecord, input: string) => Promise<InteractiveTurnContext>;
  onSessionUpdated?: (session: SessionRecord) => void;
  onSessionChanged?: (session: SessionRecord) => void;
  stateRootDir: string;
}

interface ActiveTurnOperation {
  input: string;
  turnId: string;
  controller: AbortController;
  promise: Promise<void>;
  started: boolean;
}

const TURN_SHUTDOWN_GRACE_MS = 3_000;
const HOST_SHUTDOWN_DEADLINE_MS = 8_000;

export class InteractiveSessionDriver {
  private session: SessionRecord;
  private readonly activeTurns: ActiveTurnOperation[] = [];
  private readonly recoveryTimers = new Set<NodeJS.Timeout>();
  private lastInterruptNoticeAt = 0;
  private exitRequested = false;
  private detachmentInProgress = false;

  constructor(private readonly options: InteractiveSessionDriverOptions) {
    this.session = options.session;
  }

  async run(): Promise<SessionRecord> {
    const releaseInterrupt = this.options.shell.input.bindInterrupt(() => {
      this.handleInterrupt();
    });
    const releaseProcessTermination = this.bindProcessTerminationCleanup();

    try {
      this.resumePendingTurns();
      while (true) {
        const prompt = await this.options.shell.input.readInput("> ");
        if (prompt.kind === "closed") {
          await this.closeBounded();
          return this.session;
        }

        const input = prompt.value.trim();
        if (!input) {
          continue;
        }

        const decision = await this.handleInput(input);
        if (decision === "quit") {
          await this.closeBounded();
          return this.session;
        }
        if (this.exitRequested) {
          return this.session;
        }
      }
    } finally {
      this.clearRecoveryTimers();
      releaseProcessTermination();
      releaseInterrupt();
    }
  }

  private async handleInput(input: string): Promise<LocalCommandResult> {
    const command = normalizeLocalCommand(input);
    if (command === "stop") {
      this.handleCommandStop();
      return "handled";
    }
    if (command === "new") {
      await this.handleCommandNew();
      return "handled";
    }
    if (!this.options.localCommandHandler && command === undefined) {
      this.submitAgentInput(input);
      return "continue";
    }

    let localCommandResult: LocalCommandResult;
    try {
      localCommandResult = await (this.options.localCommandHandler ?? handleLocalCommand)(
        input,
        {
          cwd: this.options.cwd,
          stateRootDir: this.options.stateRootDir,
          session: this.session,
          config: this.options.config,
          sessionStore: this.options.sessionStore,
        },
        this.options.shell.output,
      );
    } catch (error) {
      this.options.shell.output.error(getErrorMessage(error));
      return "handled";
    }

    if (localCommandResult === "continue") {
      this.submitAgentInput(input);
    } else if (localCommandResult === "quit") {
      return this.handleQuitRequest();
    }

    return localCommandResult;
  }

  private async handleQuitRequest(): Promise<LocalCommandResult> {
    this.options.shell.output.info(this.t("interaction.sessionSaved"));
    return "quit";
  }

  private handleInterrupt(): void {
    const active = this.activeTurns[0];
    if (active && !active.controller.signal.aborted) {
      active.controller.abort();
      this.showInterruptNotice(this.t("interaction.interrupted"));
      return;
    }

    if (active) {
      this.showInterruptNotice(this.t("interaction.interrupting"));
      void this.detachForForcedExit().finally(() => this.options.shell.input.close?.());
      return;
    }

    this.showInterruptNotice(this.t("interaction.exitHint"));
  }

  private showInterruptNotice(message: string): void {
    const now = Date.now();
    if (now - this.lastInterruptNoticeAt < 150) {
      return;
    }

    this.lastInterruptNoticeAt = now;
    this.options.shell.output.interrupt(message);
  }

  private bindProcessTerminationCleanup(): () => void {
    const signals: NodeJS.Signals[] = ["SIGHUP", "SIGTERM", "SIGBREAK"];
    const handler = (signal: NodeJS.Signals): void => {
      const exitCode = signalExitCode(signal);
      if (this.detachmentInProgress) process.exit(exitCode);
      const deadline = setTimeout(() => process.exit(exitCode), HOST_SHUTDOWN_DEADLINE_MS);
      deadline.unref();
      void this.detachForForcedExit().finally(() => {
        clearTimeout(deadline);
        process.exit(exitCode);
      });
    };

    for (const signal of signals) {
      process.on(signal, handler);
    }

    return () => {
      for (const signal of signals) {
        process.off(signal, handler);
      }
    };
  }

  private async detachForForcedExit(): Promise<void> {
    if (this.detachmentInProgress) {
      return;
    }

    this.detachmentInProgress = true;
    this.exitRequested = true;
    await this.closeBounded();
    this.options.shell.output.info(this.t("interaction.sessionSaved"));
  }

  private handleCommandStop(): void {
    const active = this.activeTurns.find((turn) => !turn.controller.signal.aborted);
    if (!active) {
      this.options.shell.output.info(this.t("remote.noTask"));
      return;
    }
    active.controller.abort();
    this.showInterruptNotice(this.t("remote.stopConfirmed"));
  }

  private async handleCommandNew(): Promise<void> {
    this.abortActiveTurns();
    await waitAtMost(this.waitForActiveTurns(), TURN_SHUTDOWN_GRACE_MS);
    if (this.activeTurns.length > 0) {
      this.options.shell.output.warn(this.t("interaction.interrupting"));
      return;
    }
    const session = await this.options.sessionStore.save(await this.options.sessionStore.create(this.options.cwd));
    this.session = session;
    this.options.onSessionChanged?.(session);
    this.options.onSessionUpdated?.(session);
    this.options.shell.output.info(this.t("remote.newConfirmed"));
  }

  private async terminateOwnedProcesses(): Promise<void> {
    const exitGuard = this.options.exitGuard ?? defaultInteractiveExitGuard;
    const running = await exitGuard.collectRunningProcesses(
      this.options.cwd,
        this.session.id,
    );
    if (running.length > 0) {
      const result = await exitGuard.terminateProcesses(running, this.options.cwd);
      if (result.failedPids.length > 0) {
        throw new Error(`Failed to terminate owned process trees: ${result.failedPids.join(", ")}`);
      }
    }
  }

  private async closeBounded(): Promise<void> {
    this.abortActiveTurns(true);
    const activeTurns = this.waitForActiveTurns();
    await Promise.allSettled([
      waitAtMost(activeTurns, TURN_SHUTDOWN_GRACE_MS),
      this.terminateOwnedProcesses(),
    ]).then((results) => {
      const cleanup = results[1];
      if (cleanup?.status === "rejected") throw cleanup.reason;
    });
  }

  private startTurn(input: string, admittedTurnId?: string): void {
    let durableTurnId = admittedTurnId;
    if (!durableTurnId) {
      try {
        const ledger = new ControlPlaneLedger(this.options.stateRootDir);
        try {
          durableTurnId = ledger.transaction(() => {
            if (!ledger.sessions.load(this.session.id)) ledger.sessions.save(this.session);
            return ledger.turns.admit({
              sessionId: this.session.id,
              input,
              inputSource: "external",
            }).id;
          });
        } finally {
          ledger.close();
        }
      } catch (error) {
        this.options.shell.output.error(this.t("interaction.inputRejected", { error: getErrorMessage(error) }));
        return;
      }
    }

    const controller = new AbortController();
    const operation: ActiveTurnOperation = {
      input,
      turnId: durableTurnId,
      controller,
      promise: Promise.resolve(),
      started: false,
    };
    this.activeTurns.push(operation);
    operation.promise = this.executeTurn(operation, durableTurnId)
      .finally(() => {
        const index = this.activeTurns.indexOf(operation);
        if (index >= 0) this.activeTurns.splice(index, 1);
      });
  }

  private submitAgentInput(input: string): void {
    const active = [...this.activeTurns]
      .reverse()
      .find((operation) => !operation.controller.signal.aborted);
    if (active) {
      try {
        const ledger = new ControlPlaneLedger(this.options.stateRootDir);
        try {
          const steer = ledger.turnSteers.admit({
            turnId: active.turnId,
            sessionId: this.session.id,
            text: input,
          });
          if (steer) {
            notifyBackgroundWaitersForConsumer(this.options.stateRootDir, active.turnId);
            this.options.shell.output.plain(formatSubmittedInput(input));
            this.options.shell.output.info(this.t("interaction.steerAccepted"));
            return;
          }
        } finally {
          ledger.close();
        }
      } catch (error) {
        this.options.shell.output.error(this.t("interaction.inputRejected", { error: getErrorMessage(error) }));
        return;
      }
    }
    this.startTurn(input);
  }

  private async executeTurn(operation: ActiveTurnOperation, admittedTurnId?: string): Promise<void> {
    const { input, controller } = operation;
    this.options.shell.output.plain(formatSubmittedInput(input));
    const turnDisplay = this.options.shell.createTurnDisplay({
      cwd: this.options.cwd,
      config: this.options.config,
      abortSignal: controller.signal,
    });

    try {
      const turnContext = await this.options.turnContextProvider?.(this.session, input);
      const outcome = await runHostTurn({
        host: "interactive",
        input,
        cwd: turnContext?.cwd ?? this.options.cwd,
        stateRootDir: this.options.stateRootDir,
        config: this.options.config,
        session: this.session,
        sessionStore: this.options.sessionStore,
        builtinToolFilter: turnContext?.builtinToolFilter,
        extraTools: turnContext?.extraTools,
        runtimePromptState: turnContext?.runtimePromptState,
        admittedTurnId,
        abortSignal: controller.signal,
        callbacks: turnDisplay.callbacks,
      }, {
        runTurn: this.options.runTurn,
        onRunTurnStarted: () => {
          operation.started = true;
          turnDisplay.start?.();
        },
      });

      this.session = outcome.session;
      this.options.onSessionUpdated?.(this.session);
      if (outcome.status === "aborted") {
        turnDisplay.finish?.("aborted");
        turnDisplay.flush();
        this.options.shell.output.warn(outcome.errorMessage ?? this.t("interaction.turnInterrupted"));
        return;
      }

      if (outcome.status === "failed") {
        turnDisplay.finish?.("failed");
        turnDisplay.flush();
        this.options.shell.output.error(outcome.errorMessage ?? this.t("interaction.requestFailed"));
        this.options.shell.output.info(this.t("interaction.sessionAlive"));
      } else {
        turnDisplay.finish?.("completed");
      }
    } catch (error) {
      turnDisplay.finish?.("failed");
      turnDisplay.flush();
      this.options.shell.output.error(getErrorMessage(error));
      this.options.shell.output.info(this.t("interaction.sessionAlive"));
    } finally {
      turnDisplay.dispose();
    }
  }

  private resumePendingTurns(): void {
    const ledger = new ControlPlaneLedger(this.options.stateRootDir);
    try {
      const reconciled = ledger.turns.reconcileExpired(this.session.id);
      if (reconciled > 0) this.reportInterruptedTurnRecovery(reconciled);
      const pending = ledger.turns.listPending(this.session.id);
      for (const turn of pending) {
        if (turn.status === "queued") this.startTurn(turn.input, turn.id);
        if (turn.status === "running") this.scheduleRunningTurnReconciliation(turn.id, turn.leaseExpiresAt);
      }
    } finally {
      ledger.close();
    }
  }

  private scheduleRunningTurnReconciliation(turnId: string, leaseExpiresAt?: string): void {
    const expiresAt = leaseExpiresAt ? Date.parse(leaseExpiresAt) : Date.now();
    const delayMs = Number.isFinite(expiresAt) ? Math.max(0, expiresAt - Date.now() + 10) : 0;
    const timer = setTimeout(() => {
      this.recoveryTimers.delete(timer);
      const ledger = new ControlPlaneLedger(this.options.stateRootDir);
      try {
        const reconciled = ledger.turns.reconcileExpired(this.session.id);
        if (reconciled > 0) {
          this.reportInterruptedTurnRecovery(reconciled);
          const recovered = ledger.turns.listPending(this.session.id);
          for (const turn of recovered) {
            if (turn.status === "queued" && !this.activeTurns.some((active) => active.turnId === turn.id)) {
              this.startTurn(turn.input, turn.id);
            }
          }
          return;
        }
        const turn = ledger.turns.load(turnId);
        if (turn?.status === "running") {
          this.scheduleRunningTurnReconciliation(turn.id, turn.leaseExpiresAt);
        }
      } finally {
        ledger.close();
      }
    }, delayMs);
    timer.unref();
    this.recoveryTimers.add(timer);
  }

  private reportInterruptedTurnRecovery(count: number): void {
    this.options.shell.output.warn(
      this.t("interaction.recoveredTurns", { count }),
    );
  }

  private clearRecoveryTimers(): void {
    for (const timer of this.recoveryTimers) clearTimeout(timer);
    this.recoveryTimers.clear();
  }

  private abortActiveTurns(preserveQueued = false): void {
    for (const turn of this.activeTurns) {
      if (turn.controller.signal.aborted) continue;
      turn.controller.abort(
        preserveQueued
          ? turn.started ? PRESERVE_ACTIVE_TURN_ABORT_REASON : PRESERVE_QUEUED_TURN_ABORT_REASON
          : undefined,
      );
    }
  }

  private async waitForActiveTurns(): Promise<void> {
    await Promise.allSettled(this.activeTurns.map((turn) => turn.promise));
  }

  private t(key: MessageKey, values: Readonly<Record<string, string | number>> = {}): string {
    return translate(this.options.config.locale, key, values);
  }
}

function isYes(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === "y" || normalized === "yes";
}

function formatSubmittedInput(input: string): string {
  return input
    .split("\n")
    .map((line, index) => `${index === 0 ? "> " : "… "}${line}`)
    .join("\n");
}

async function waitAtMost(promise: Promise<unknown>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  await Promise.race([
    promise.then(() => undefined),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
}

function signalExitCode(signal: NodeJS.Signals): number {
  if (signal === "SIGHUP") return 129;
  if (signal === "SIGTERM") return 143;
  if (signal === "SIGBREAK") return 149;
  return 1;
}
