import type { AgentCallbacks, RunTurnResult } from "../agent/types.js";
import type { SessionStoreLike } from "../session/index.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { runHostTurn } from "./turn.js";
import type { HostTurnDependencies } from "./types.js";
import { translate } from "../i18n/index.js";

export interface BoundHostTurnDisplay {
  noteTerminalState?(): void;
  flush(): Promise<void>;
  dispose(): void;
}

export interface BoundHostTurnOutput {
  warn(text: string): void;
  error(text: string): void;
  info(text: string): void;
}

export interface BoundHostTurnOptions<TActiveTurn> {
  host?: string;
  buildInput: () => Promise<string>;
  cwd: string;
  stateRootDir?: string;
  admittedTurnId?: string;
  config: RuntimeConfig;
  session: SessionRecord;
  sessionStore: SessionStoreLike;
  output: BoundHostTurnOutput;
  display: BoundHostTurnDisplay;
  callbacks?: AgentCallbacks;
  shouldAbortOnStart?: () => boolean;
  markQueuedTurnStarted: () => void;
  createActiveTurn: (controller: AbortController, sessionId: string) => TActiveTurn;
  onActiveTurnStart: (activeTurn: TActiveTurn) => void;
  onActiveTurnEnd: () => void;
  onCompleted?: (result: RunTurnResult, session: SessionRecord) => void;
  onAborted?: (session: SessionRecord) => void;
  onFailed?: (errorMessage: string, session: SessionRecord) => void;
}

export async function runBoundHostTurn<TActiveTurn>(
  options: BoundHostTurnOptions<TActiveTurn>,
  dependencies: HostTurnDependencies = {},
): Promise<SessionRecord> {
  let session = options.session;
  const controller = new AbortController();
  options.onActiveTurnStart(options.createActiveTurn(controller, session.id));
  options.markQueuedTurnStarted();

  try {
    const abortOnStart = options.shouldAbortOnStart?.() ?? false;
    const input = await options.buildInput();

    const outcome = await runHostTurn(
      {
        host: options.host,
        input,
        cwd: options.cwd,
        stateRootDir: options.stateRootDir,
        config: options.config,
        session,
        sessionStore: options.sessionStore,
        abortSignal: controller.signal,
        callbacks: options.callbacks,
        admittedTurnId: options.admittedTurnId,
      },
      {
        ...dependencies,
        onRunTurnStarted: () => {
          dependencies.onRunTurnStarted?.();
          if (abortOnStart) {
            queueMicrotask(() => {
              if (!controller.signal.aborted) {
                controller.abort();
              }
            });
          }
        },
      },
    );
    session = outcome.session;

    if (outcome.status === "completed") {
      options.onCompleted?.(outcome.result!, session);
      return session;
    }

    if (outcome.status === "aborted") {
      options.display.noteTerminalState?.();
      options.output.warn(outcome.errorMessage ?? translate(options.config.locale, "interaction.turnInterrupted"));
      options.onAborted?.(session);
      return session;
    }

    options.display.noteTerminalState?.();
    const requestFailed = translate(options.config.locale, "interaction.requestFailed");
    options.output.error(outcome.errorMessage ?? requestFailed);
    options.output.info(translate(options.config.locale, "interaction.sessionAlive"));
    options.onFailed?.(outcome.errorMessage ?? requestFailed, session);
    return session;
  } finally {
    options.onActiveTurnEnd();
    await options.display.flush();
    options.display.dispose();
  }
}
