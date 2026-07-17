import { passed, type EvaluationCheckId, type EvaluationCheckResult } from "./types.js";
import { prepareCheckWorkspace } from "./workspace.js";
import { executionOwnership } from "../control/types.js";

const EVAL_EXECUTION_OWNER = {
  ownerSessionId: "eval-session",
  createdBySessionId: "eval-session",
  parentTurnId: "eval-turn",
  originToolCallId: "eval-tool-call",
} as const;

export async function runHostTurnBoundaryCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const { runHostTurn } = await import("../host/turn.js");
  const { SessionEventStore } = await import("../session/events.js");
  const { SessionStore } = await import("../session/store.js");
  const { resolveTelegramRuntimeConfig, resolveWeixinRuntimeConfig } = await import("../config/hosts.js");
  const { getInitialRuntimeConfig } = await import("../config/initialConfig.js");
  const { getAppPaths } = await import("../config/paths.js");
  const workspace = await prepareCheckWorkspace(rootDir, "host-turn-boundary");
  const initial = getInitialRuntimeConfig();
  const config = {
    ...initial,
    apiKey: "eval-key",
    telegram: resolveTelegramRuntimeConfig(initial.telegram, workspace),
    weixin: resolveWeixinRuntimeConfig(initial.weixin, workspace),
    paths: getAppPaths(workspace),
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  const session = await sessionStore.save(await sessionStore.create(workspace));
  const outcome = await runHostTurn({
    host: "eval",
    input: "host boundary check",
    cwd: workspace,
    stateRootDir: workspace,
    config,
    session,
    sessionStore,
  }, {
    createToolRegistry: async () => ({
      definitions: [],
      entries: [],
      execute: async () => ({ ok: true, output: "" }),
      close: async () => undefined,
    }),
    runTurn: async (options) => ({
      session: options.session,
      changedPaths: [],
      transition: {
        action: "finalize",
        reason: {
          code: "finalize.completed",
          changedPaths: [],
        },
        timestamp: new Date().toISOString(),
      },
    }),
  });
  const events = await new SessionEventStore(config.paths.eventsDir).list(session.id);
  const eventTypes = events.map((event) => event.type);
  if (outcome.status !== "completed" || !eventTypes.includes("turn.started") || !eventTypes.includes("turn.completed")) {
    return {
      id,
      status: "failed",
      fact: `host turn status=${outcome.status}; events=${eventTypes.join(",") || "none"}`,
    };
  }
  return passed(id, `host turn boundary ready: status=${outcome.status}, events=${eventTypes.join(",")}`);
}

export async function runRemoteEntrypointsCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { buildFileTurnInput } = await import("../telegram/inboundFiles.js");
  const turnInput = buildFileTurnInput(
      {
        kind: "private_file_message",
        updateId: 1,
        peerKey: "telegram:private:100",
        userId: 100,
        chatId: 100,
        messageId: 10,
        text: "inspect upload",
        fileId: "file-id",
        fileUniqueId: "file-unique",
        fileName: "brief.md",
        fileSize: 10,
        raw: {
          update_id: 1,
        },
      },
      {
        id: "att-1",
        peerKey: "telegram:private:100",
        userId: 100,
        chatId: 100,
        updateId: 1,
        sessionId: "session-1",
        messageId: 10,
        telegramFileId: "file-id",
        telegramFileUniqueId: "file-unique",
        telegramFilePath: "documents/brief.md",
        localFilePath: "uploads/brief.md",
        fileName: "brief.md",
        caption: "inspect upload",
        mimeType: "text/markdown",
        fileSize: 10,
        createdAt: "2026-06-15T00:00:00.000Z",
        updatedAt: "2026-06-15T00:00:00.000Z",
      },
      [],
      process.cwd(),
  );
  const normalizedTurnInput = turnInput.replaceAll("\\", "/");

  if (!normalizedTurnInput.startsWith("inspect upload") || !normalizedTurnInput.includes("brief.md -> uploads/brief.md")) {
    return {
      id,
      status: "failed",
      fact: `remote entrypoint incomplete: telegramInput=${turnInput.length}`,
    };
  }
  return passed(id, "remote entrypoint ready: Telegram file input enters the shared turn contract");
}

export async function runRecoveryDrillsCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const { BackgroundExecutionStore, reconcileBackgroundExecutions } = await import("../execution/background.js");
  const { terminateRunningExecutionProcesses } = await import("../execution/lifecycle.js");
  const { buildRuntimeStatus } = await import("../runtime/status.js");
  const workspace = await prepareCheckWorkspace(rootDir, "recovery-drills");

  const backgroundStore = new BackgroundExecutionStore(workspace);
  const lostBackground = backgroundStore.create({
    ...EVAL_EXECUTION_OWNER,
    command: "lost process",
    cwd: workspace,
    requestedBy: "eval",
  });
  backgroundStore.markRunning(lostBackground.id, executionOwnership(lostBackground), { pid: 999_999_999 });
  const lost = reconcileBackgroundExecutions(workspace, undefined, new Date(Date.now() + 60_000));

  const active = backgroundStore.create({
    ...EVAL_EXECUTION_OWNER,
    command: "active background",
    cwd: workspace,
    requestedBy: "eval",
  });
  const missingPid = 999_999_998;
  backgroundStore.markRunning(active.id, executionOwnership(active), { pid: missingPid });
  const terminated = terminateRunningExecutionProcesses(workspace, [{
    kind: "background",
    id: active.id,
    pid: missingPid,
    summary: "missing background",
  }]);
  const status = await buildRuntimeStatus(workspace);

  if (
    lost.lostExecutions.length !== 1 ||
    !terminated.terminatedPids.includes(missingPid) ||
    status.executions.total < 2
  ) {
    return {
      id,
      status: "failed",
      fact: `recovery drills incomplete: lost=${lost.lostExecutions.length}, terminated=${terminated.terminatedPids.length}, executions=${status.executions.total}`,
    };
  }

  return passed(
    id,
    `recovery drills ready: lost=${lost.lostExecutions.length}, terminated=${terminated.terminatedPids.length}, executions=${status.executions.total}`,
  );
}
