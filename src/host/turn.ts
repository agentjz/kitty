import { AgentTurnError, getErrorMessage } from "../agent/errors.js";
import { runAgentTurn } from "../agent/turn.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { buildLeadWakeFacts, waitForLeadWaitExecutions } from "../execution/leadWait.js";
import { enterCrashContext } from "../observability/crashRecorder.js";
import { recordHostTurnFinished, recordHostTurnStarted } from "../observability/hostEvents.js";
import { isAbortError } from "../utils/abort.js";
import { createHostToolRegistry } from "./toolRegistry.js";
import type { HostTurnDependencies, HostTurnOptions, HostTurnOutcome } from "./types.js";

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
  let toolRegistry: Awaited<ReturnType<typeof createToolRegistry>> | null = null;

  await recordHostTurnStarted(stateRootDir, {
    host,
    sessionId: options.session.id,
    identityKind: (options.identity ?? DEFAULT_IDENTITY).kind,
    identityName: (options.identity ?? DEFAULT_IDENTITY).name,
    cwd: options.cwd,
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
      return {
        status: "aborted",
        session: options.session,
        errorMessage: "Turn interrupted. You can keep chatting.",
      };
    }

    let nextInput = options.input;
    let session = options.session;
    let runtimePromptState = options.runtimePromptState;
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
        toolRegistry,
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
      const wakeFacts = buildLeadWakeFacts(executions);
      nextInput = wakeFacts.userInput;
      runtimePromptState = {
        ...(runtimePromptState ?? {}),
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

async function readStateRootDir(cwd: string): Promise<string> {
  try {
    return (await resolveProjectRoots(cwd)).stateRootDir;
  } catch {
    return cwd;
  }
}
