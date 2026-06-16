import type { EvaluationCheckId, EvaluationCheckResult } from "./types.js";
import { passed } from "./types.js";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { WebSocket, WebSocketServer } from "ws";

export const EVALUATION_CHECK_IDS: readonly EvaluationCheckId[] = [
  "runtime-status-builds",
  "project-map-builds",
  "memory-assets-readable",
  "extension-surface-current",
  "skill-packages-readable",
  "config-preflight-readable",
  "cache-economy-ready",
  "host-turn-boundary-runs",
  "remote-entrypoints-available",
  "recovery-drills-pass",
];

export function listEvaluationChecks(): EvaluationCheckId[] {
  return [...EVALUATION_CHECK_IDS];
}

export async function runEvaluationCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  try {
    switch (id) {
      case "runtime-status-builds": {
        const { buildRuntimeStatus } = await import("../runtime/status.js");
        const status = await buildRuntimeStatus(rootDir);
        return passed(id, `runtime status ready: sessions=${status.sessions.total}, executions=${status.executions.total}`);
      }
      case "project-map-builds": {
        const { buildProjectMap } = await import("../project/map.js");
        const map = await buildProjectMap(rootDir);
        return passed(id, `project map ready: dirs=${map.topLevelDirectories.length}, scripts=${map.packageScripts.length}`);
      }
      case "memory-assets-readable": {
        const { listRuntimeMemoryAssets } = await import("../runtime/memory/index.js");
        const assets = await listRuntimeMemoryAssets(rootDir);
        return passed(id, `memory assets readable: total=${assets.length}`);
      }
      case "extension-surface-current": {
        const { EXTENSION_DEFINITIONS } = await import("../extensions/definitions.js");
        const enabled = EXTENSION_DEFINITIONS.filter((extension) => extension.defaultEnabled).map((extension) => extension.id);
        return passed(id, `extension surface ready: default=${enabled.join(",")}`);
      }
      case "skill-packages-readable": {
        const { loadProjectContext } = await import("../context/projectContext.js");
        const project = await loadProjectContext(rootDir, { projectDocMaxBytes: 24_576 });
        return passed(id, `skills readable: total=${project.skills.length}`);
      }
      case "config-preflight-readable": {
        const { inspectConfigPreflight } = await import("../config/preflight.js");
        const preflight = await inspectConfigPreflight(rootDir);
        return passed(id, `config preflight ready: ready=${preflight.ready}`);
      }
      case "cache-economy-ready": {
        return await runCacheEconomyCheck(id);
      }
      case "host-turn-boundary-runs": {
        return await runHostTurnBoundaryCheck(id, rootDir);
      }
      case "remote-entrypoints-available": {
        return await runRemoteEntrypointsCheck(id);
      }
      case "recovery-drills-pass": {
        return await runRecoveryDrillsCheck(id, rootDir);
      }
    }
  } catch (error) {
    return {
      id,
      status: "failed",
      fact: `${id} failed`,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCacheEconomyCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { normalizeProviderUsage } = await import("../provider/usageNormalizer.js");
  const { resolveProviderCachePolicy } = await import("../provider/cachePolicy.js");
  const { buildCompressedContextRequest } = await import("../context/runtime/compression/builder.js");

  const deepSeek = normalizeProviderUsage({
    prompt_tokens: 1000,
    prompt_cache_hit_tokens: 800,
    prompt_cache_miss_tokens: 200,
    completion_tokens: 40,
  });
  const openai = normalizeProviderUsage({
    prompt_tokens: 1200,
    prompt_tokens_details: {
      cached_tokens: 960,
    },
  });
  const policy = resolveProviderCachePolicy({
    provider: "openai",
    model: "gpt-5.5",
    sessionId: "eval-session",
  });
  const first = buildCompressedContextRequest(
    "stable system",
    [{ role: "user", content: "first", createdAt: "2026-06-16T00:00:00.000Z" }],
    {
      contextWindowMessages: 120,
      model: "gpt-5.5",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );
  const second = buildCompressedContextRequest(
    "stable system",
    [
      { role: "user", content: "first", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "user", content: "second", createdAt: "2026-06-16T00:01:00.000Z" },
    ],
    {
      contextWindowMessages: 120,
      model: "gpt-5.5",
      maxContextChars: 900_000,
      contextSummaryChars: 120_000,
    },
  );

  if (
    deepSeek?.cacheHitRate !== 0.8 ||
    openai?.cacheReadTokens !== 960 ||
    !policy.promptCacheKey ||
    first.cacheLayout?.stablePrefixFingerprint !== second.cacheLayout?.stablePrefixFingerprint
  ) {
    return {
      id,
      status: "failed",
      fact: "cache economy checks did not converge",
    };
  }

  return passed(
    id,
    `cache economy ready: deepseekHit=${deepSeek?.cacheHitRate}, openaiCached=${openai?.cacheReadTokens}, stablePrefix=${first.cacheLayout?.stablePrefixFingerprint ?? "unknown"}`,
  );
}

async function runHostTurnBoundaryCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const { runHostTurn } = await import("../host/turn.js");
  const { SessionEventStore } = await import("../session/events.js");
  const { SessionStore } = await import("../session/store.js");
  const { resolveTelegramRuntimeConfig } = await import("../config/hosts.js");
  const { getInitialRuntimeConfig } = await import("../config/initialConfig.js");
  const { getAppPaths } = await import("../config/paths.js");
  const workspace = await prepareCheckWorkspace(rootDir, "host-turn-boundary");
  const initial = getInitialRuntimeConfig();
  const config = {
    ...initial,
    apiKey: "eval-key",
    telegram: resolveTelegramRuntimeConfig(initial.telegram, workspace),
    paths: getAppPaths(workspace),
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir, {
    memorySessionsDir: config.paths.sessionMemoryDir,
  });
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

async function runRemoteEntrypointsCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { createWebInputPort } = await import("../web/inputPort.js");
  const { serveHtml } = await import("../web/serveHtml.js");
  const { buildFileTurnInput } = await import("../telegram/inboundFiles.js");
  const wss = new WebSocketServer({ port: 0 });
  const input = createWebInputPort(wss);
  const port = (wss.address() as import("net").AddressInfo).port;
  const client = new WebSocket(`ws://127.0.0.1:${port}`);

  try {
    await once(client, "open");
    const pending = input.readInput("> ");
    client.send(JSON.stringify({ type: "input", text: "remote parity check" }));
    const received = await pending;
    const html = serveHtml();
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

    if (received.kind !== "submit" || !html.includes("小猫智能体") || !turnInput.includes("The user uploaded a file")) {
      return {
        id,
        status: "failed",
        fact: `remote entrypoints incomplete: web=${received.kind}, html=${html.length}, telegramInput=${turnInput.length}`,
      };
    }
    return passed(id, "remote entrypoints ready: web input and Telegram file turn input are available");
  } finally {
    client.close();
    await closeWebSocketServer(wss);
  }
}

async function runRecoveryDrillsCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const { BackgroundExecutionStore, reconcileBackgroundExecutions } = await import("../execution/background.js");
  const { ExecutionStore } = await import("../execution/store.js");
  const { pauseExpiredLeadWaitExecutions } = await import("../execution/leadWait.js");
  const { terminateRunningExecutionProcesses } = await import("../execution/lifecycle.js");
  const { buildRuntimeStatus } = await import("../runtime/status.js");
  const workspace = await prepareCheckWorkspace(rootDir, "recovery-drills");

  const backgroundStore = new BackgroundExecutionStore(workspace);
  const lostBackground = backgroundStore.create({
    command: "lost process",
    cwd: workspace,
    requestedBy: "eval",
  });
  backgroundStore.markRunning(lostBackground.id, { pid: 999_999_999 });
  const stale = reconcileBackgroundExecutions(workspace);

  const executionStore = new ExecutionStore(workspace);
  const stuck = executionStore.create({
    kind: "subagent",
    prompt: "stuck delegated work",
    cwd: workspace,
    requestedBy: "eval",
    timeoutMs: 10,
  });
  const running = executionStore.markRunning(stuck.id, { pid: process.pid });
  const deadline = Date.parse(running.startedAt ?? running.createdAt) + 11;
  const paused = pauseExpiredLeadWaitExecutions(workspace, [stuck.id], deadline);

  const active = executionStore.create({
    kind: "subagent",
    prompt: "active worker",
    cwd: workspace,
    requestedBy: "eval",
  });
  const missingPid = 999_999_998;
  executionStore.markRunning(active.id, { pid: missingPid });
  const terminated = terminateRunningExecutionProcesses(workspace, [{
    kind: "subagent",
    id: active.id,
    pid: missingPid,
    summary: "missing worker",
  }]);
  const status = await buildRuntimeStatus(workspace);

  if (
    stale.staleExecutions.length !== 1 ||
    paused.length !== 1 ||
    !terminated.terminatedPids.includes(missingPid) ||
    status.executions.total < 3
  ) {
    return {
      id,
      status: "failed",
      fact: `recovery drills incomplete: stale=${stale.staleExecutions.length}, paused=${paused.length}, terminated=${terminated.terminatedPids.length}, executions=${status.executions.total}`,
    };
  }

  return passed(
    id,
    `recovery drills ready: stale=${stale.staleExecutions.length}, paused=${paused.length}, terminated=${terminated.terminatedPids.length}, executions=${status.executions.total}`,
  );
}

async function prepareCheckWorkspace(rootDir: string, name: string): Promise<string> {
  const workspace = path.join(rootDir, ".kitty", "eval-checks", name);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  return workspace;
}

async function closeWebSocketServer(wss: WebSocketServer): Promise<void> {
  for (const client of wss.clients) {
    client.close();
  }
  await new Promise<void>((resolve, reject) => {
    wss.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}
