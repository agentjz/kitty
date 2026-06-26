import type { EvaluationCheckId, EvaluationCheckResult, EvaluationScenario } from "./types.js";
import { passed } from "./types.js";
import type { LoadedSkill } from "../types.js";
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
  "tool-output-governance-ready",
  "production-scene-ready",
  "host-turn-boundary-runs",
  "remote-entrypoints-available",
  "recovery-drills-pass",
];

export const EVALUATION_SCENARIOS: readonly EvaluationScenario[] = [
  {
    id: "runtime-status-builds",
    title: "当前现场可审阅",
    userPath: "用户运行 `kitty status` 时，可以看到 session、context、memory、skills、execution 和 cache 的当前事实。",
    evidence: "构建 runtime status，并确认 sessions / executions 等现场摘要可用。",
  },
  {
    id: "project-map-builds",
    title: "进入仓库能快速定向",
    userPath: "用户把 Kitty 打开在一个仓库里，模型能看到目录、入口、脚本、测试、项目文档和 git 事实。",
    evidence: "构建 project map，并确认目录、脚本和仓库事实可读。",
  },
  {
    id: "memory-assets-readable",
    title: "记忆资产可审阅",
    userPath: "用户可以查看 session/project/user/evidence memory，不靠隐藏上下文猜历史。",
    evidence: "枚举 runtime memory assets，并确认资产索引可读。",
  },
  {
    id: "extension-surface-current",
    title: "工具面只暴露当前能力",
    userPath: "默认 agent 打开当前真实 extensions，不复活已删除能力。",
    evidence: "读取 extension registry，并确认默认启用面来自当前定义。",
  },
  {
    id: "skill-packages-readable",
    title: "方法包按需可用",
    userPath: "模型能先看到 skill 索引，必要时再加载正文、资源或脚本。",
    evidence: "加载 project context，并确认 runtime skills 可发现。",
  },
  {
    id: "config-preflight-readable",
    title: "首次配置路径清楚",
    userPath: "用户运行 `kitty init` / `kitty doctor` 后，能知道 `.kitty/.env` 是否完整、下一步补什么。",
    evidence: "执行 config preflight，并确认本地模板和 env contract 可检查。",
  },
  {
    id: "cache-economy-ready",
    title: "成本事实可审阅",
    userPath: "用户能看到 provider usage、cache hit/miss、稳定前缀和按需 skill 边界，而不是只看到 token 总数。",
    evidence: "验证 usage 归一化、provider cache policy、stable/volatile prompt fingerprint、skill index boundary 和大输出压缩。",
  },
  {
    id: "tool-output-governance-ready",
    title: "工具输出治理可验收",
    userPath: "工具产生大量输出时，模型只看到有界证据，完整输出仍可恢复，节省 token 的事实能进入现场。",
    evidence: "构造测试失败、搜索输出和超大通用输出，确认投影有界、raw output 可恢复、saved tokens 可记录。",
  },
  {
    id: "production-scene-ready",
    title: "生产现场一眼可读",
    userPath: "用户运行 `kitty status` 或 `kitty background` 时，能看到当前现场、后台风险、下一步、恢复状态、成本、skill 和 memory 可审阅性。",
    evidence: "构建带 session、memory、cache、skill、background 和 provider usage 的 runtime scene，并确认 scene 与 CLI 文本都暴露关键事实。",
  },
  {
    id: "host-turn-boundary-runs",
    title: "一次 agent turn 有明确边界",
    userPath: "用户发起一次任务后，host 能记录 turn 开始、完成、失败或中断，不把内部事实写成用户意图。",
    evidence: "用假 turn 跑 host boundary，并确认 session events 闭环。",
  },
  {
    id: "remote-entrypoints-available",
    title: "远程入口复用同一主干",
    userPath: "Web / Telegram 入口能接入同一 turn 输入，不分裂成另一套 agent。",
    evidence: "验证 web input port、HTML shell 和 Telegram file turn input 可用。",
  },
  {
    id: "recovery-drills-pass",
    title: "后台和子执行可恢复",
    userPath: "background 或 subagent 卡住、消失、超时后，Kitty 能 reconcile、暂停等待或终止现场。",
    evidence: "演练 stale background、expired lead-wait subagent、running process termination 和 runtime status。",
  },
];

export function listEvaluationChecks(): EvaluationCheckId[] {
  return [...EVALUATION_CHECK_IDS];
}

export function listEvaluationScenarios(): EvaluationScenario[] {
  return [...EVALUATION_SCENARIOS];
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
      case "tool-output-governance-ready": {
        return await runToolOutputGovernanceCheck(id);
      }
      case "production-scene-ready": {
        return await runProductionSceneCheck(id, rootDir);
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

async function runToolOutputGovernanceCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { governToolOutput } = await import("../tools/outputGovernance/index.js");
  const testOutput = governToolOutput({
    toolName: "bash",
    command: "npm test",
    status: "failed",
    exitCode: 1,
    output: [
      "FAIL tests/provider/deepseek-replay.test.ts",
      "Expected reasoning_content to be present.",
      "Tests: 1 failed, 24 passed, 25 total",
      "x".repeat(10_000),
    ].join("\n"),
    outputPath: ".kitty/observability/command-output/eval/test.txt",
    truncated: true,
  });
  const searchOutput = governToolOutput({
    toolName: "bash",
    command: "rg provider src",
    status: "completed",
    exitCode: 0,
    output: Array.from({ length: 80 }, (_, index) => `src/provider/file${index}.ts:${index + 1}:provider`).join("\n"),
  });
  const hugeOutput = governToolOutput({
    toolName: "bash",
    command: "node huge-output.js",
    status: "completed",
    exitCode: 0,
    output: Array.from({ length: 40_000 }, (_, index) => `line ${index}: ${"x".repeat(80)}`).join("\n"),
    outputPath: ".kitty/observability/command-output/eval/huge.txt",
    truncated: true,
  });

  const ready =
    testOutput.kind === "test" &&
    testOutput.projection.includes("FAIL tests/provider/deepseek-replay.test.ts") &&
    testOutput.projection.includes("[full output:") &&
    searchOutput.kind === "search" &&
    searchOutput.projection.includes("matches shown:") &&
    hugeOutput.kind === "generic" &&
    hugeOutput.projectedChars < 4_000 &&
    hugeOutput.savedTokens > 100_000 &&
    hugeOutput.outputPath === ".kitty/observability/command-output/eval/huge.txt";

  if (!ready) {
    return {
      id,
      status: "failed",
      fact: `tool output governance incomplete: test=${testOutput.kind}/${testOutput.savedTokens}, search=${searchOutput.kind}/${searchOutput.savedTokens}, huge=${hugeOutput.projectedChars}/${hugeOutput.savedTokens}`,
    };
  }

  return passed(
    id,
    `tool output governance ready: testSaved=${testOutput.savedTokens}, searchSaved=${searchOutput.savedTokens}, hugeProjected=${hugeOutput.projectedChars}, hugeSaved=${hugeOutput.savedTokens}`,
  );
}

async function runCacheEconomyCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { normalizeProviderUsage } = await import("../provider/usageNormalizer.js");
  const { resolveProviderCachePolicy } = await import("../provider/cachePolicy.js");
  const { buildCompressedContextRequest } = await import("../context/runtime/compression/builder.js");
  const { buildContextRuntimePromptLayers } = await import("../context/runtime/prompt.js");
  const { renderPromptLayers } = await import("../agent/prompt/format.js");
  const { getInitialRuntimeConfig } = await import("../config/initialConfig.js");
  const { getAppPaths } = await import("../config/paths.js");
  const { resolveTelegramRuntimeConfig } = await import("../config/hosts.js");

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
  const config = {
    ...getInitialRuntimeConfig(),
    apiKey: "eval-key",
    model: "gpt-5.5",
    telegram: resolveTelegramRuntimeConfig(getInitialRuntimeConfig().telegram, process.cwd()),
    paths: getAppPaths(process.cwd()),
  };
  const projectContext = {
    rootDir: process.cwd(),
    stateRootDir: process.cwd(),
    cwd: process.cwd(),
    instructions: [],
    instructionText: "",
    instructionTruncated: false,
    ignoreRules: [],
    skills: [buildCostSkillFixture()],
  };
  const firstPrompt = buildContextRuntimePromptLayers({
    cwd: process.cwd(),
    config,
    projectContext: {
      ...projectContext,
      projectMap: {
        rootDir: process.cwd(),
        cwd: process.cwd(),
        topLevelDirectories: ["src"],
        entryFiles: ["src/cli.ts"],
        testDirectories: ["tests"],
        packageScripts: ["test"],
        specDocuments: ["spec/README.md"],
        git: {
          available: true,
          hasChanges: false,
          recentChanges: [],
        },
        summary: "Evaluation project map fixture.",
        updatedAt: "2026-06-16T00:00:00.000Z",
      },
    },
  });
  const secondPrompt = buildContextRuntimePromptLayers({
    cwd: process.cwd(),
    config,
    projectContext: {
      ...projectContext,
      projectMap: {
        rootDir: process.cwd(),
        cwd: process.cwd(),
        topLevelDirectories: ["src"],
        entryFiles: ["src/cli.ts"],
        testDirectories: ["tests"],
        packageScripts: ["test"],
        specDocuments: ["spec/README.md"],
        git: {
          available: true,
          hasChanges: true,
          recentChanges: ["M src/context/runtime/compression/builder.ts"],
        },
        summary: "Evaluation project map fixture.",
        updatedAt: "2026-06-16T00:01:00.000Z",
      },
    },
  });
  const requestConfig = {
    contextWindowMessages: 120,
    model: "gpt-5.5",
    maxContextChars: 900_000,
    contextSummaryChars: 120_000,
  };
  const first = buildCompressedContextRequest(
    firstPrompt,
    [
      { role: "user", content: "first", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "tool", name: "bash", content: `large output ${"x".repeat(20_000)}`, createdAt: "2026-06-16T00:00:01.000Z" },
    ],
    requestConfig,
  );
  const second = buildCompressedContextRequest(
    secondPrompt,
    [
      { role: "user", content: "first", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "tool", name: "bash", content: `large output ${"x".repeat(20_000)}`, createdAt: "2026-06-16T00:00:01.000Z" },
      { role: "user", content: "second", createdAt: "2026-06-16T00:01:00.000Z" },
    ],
    requestConfig,
  );
  const compactedLargeOutput = buildCompressedContextRequest(
    firstPrompt,
    [
      { role: "user", content: "large output", createdAt: "2026-06-16T00:00:00.000Z" },
      { role: "tool", name: "bash", content: `large output ${"x".repeat(20_000)}`, createdAt: "2026-06-16T00:00:01.000Z" },
      { role: "user", content: "continue", createdAt: "2026-06-16T00:00:02.000Z" },
    ],
    {
      contextWindowMessages: 3,
      model: "gpt-5.5",
      maxContextChars: 8_000,
      contextSummaryChars: 600,
    },
  );
  const renderedPrompt = renderPromptLayers(firstPrompt);

  if (
    deepSeek?.cacheHitRate !== 0.8 ||
    openai?.cacheReadTokens !== 960 ||
    !policy.promptCacheKey ||
    first.cacheLayout?.stablePrefixFingerprint !== second.cacheLayout?.stablePrefixFingerprint ||
    first.cacheLayout?.volatileTailFingerprint === second.cacheLayout?.volatileTailFingerprint ||
    renderedPrompt.includes("FULL_SKILL_BODY_MUST_NOT_ENTER_DEFAULT_CONTEXT") ||
    !renderedPrompt.includes("cost-skill") ||
    (compactedLargeOutput.cacheLayout?.volatileTailChars ?? Number.POSITIVE_INFINITY) >= 20_000
  ) {
    return {
      id,
      status: "failed",
      fact: "cache economy checks did not converge",
    };
  }

  return passed(
    id,
    `cache economy ready: deepseekHit=${deepSeek?.cacheHitRate}, openaiCached=${openai?.cacheReadTokens}, stablePrefix=${first.cacheLayout?.stablePrefixFingerprint ?? "unknown"}, stableChars=${first.cacheLayout?.stablePrefixChars ?? 0}, compactedTailChars=${compactedLargeOutput.cacheLayout?.volatileTailChars ?? 0}, skillIndex=only`,
  );
}

async function runProductionSceneCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const { buildRuntimeStatus } = await import("../runtime/status.js");
  const { formatRuntimeStatusText } = await import("../cli/commands/runtimeStatusPresenter.js");
  const { ControlPlaneLedger } = await import("../control/ledger.js");
  const { SessionStore } = await import("../session/store.js");
  const workspace = await prepareCheckWorkspace(rootDir, "production-scene");

  await fs.mkdir(path.join(workspace, "skills", "scene-skill"), { recursive: true });
  await fs.writeFile(
    path.join(workspace, "skills", "scene-skill", "SKILL.md"),
    [
      "---",
      "name: scene-skill",
      "description: Checks production scene readiness.",
      "requires: node",
      "---",
      "Use when validating production runtime scene.",
    ].join("\n"),
    "utf8",
  );

  const sessionStore = new SessionStore(path.join(workspace, ".kitty", "sessions"), {
    memorySessionsDir: path.join(workspace, ".kitty", "memory", "sessions"),
  });
  const session = await sessionStore.save({
    ...(await sessionStore.create(workspace)),
    title: "Production scene check",
    sessionMemory: {
      version: 1,
      summary: "User needs production runtime visibility.",
      updatedAt: "2026-06-18T00:00:00.000Z",
    },
    contextBudget: {
      version: 1,
      limitChars: 100_000,
      estimatedChars: 50_000,
      remainingChars: 50_000,
      usageRatio: 0.5,
      compressed: false,
      compressionMode: "none",
      compressionReason: "within_budget",
      sources: [{ name: "nearFieldConversation", chars: 20_000, messages: 4 }],
      promptHotspots: [],
      cacheLayout: {
        stablePrefixFingerprint: "scene-stable",
        volatileTailFingerprint: "scene-tail",
        stablePrefixChars: 30_000,
        volatileTailChars: 20_000,
        stableSources: ["staticPrompt"],
        volatileSources: ["runtimeFacts", "nearFieldConversation"],
      },
    },
  });

  const eventsDir = path.join(workspace, ".kitty", "observability", "events");
  await fs.mkdir(eventsDir, { recursive: true });
  await fs.writeFile(
    path.join(eventsDir, "2026-06-18.jsonl"),
    JSON.stringify({
      version: 1,
      timestamp: "2026-06-18T00:00:00.000Z",
      event: "model.request",
      status: "completed",
      model: "gpt-5.5",
      durationMs: 123,
      details: {
        provider: "openai",
        usageAvailable: true,
        usage: {
          totalTokens: 1000,
          cacheReadTokens: 700,
          cacheMissTokens: 300,
          cacheHitRate: 0.7,
        },
      },
    }) + "\n",
    "utf8",
  );

  const ledger = new ControlPlaneLedger(workspace);
  try {
    ledger.executions.create({
      kind: "background",
      status: "running",
      command: "long production task",
      cwd: workspace,
      requestedBy: "lead",
      pid: process.pid,
      sessionId: session.id,
    });
  } finally {
    ledger.close();
  }

  const status = await buildRuntimeStatus(workspace);
  const text = formatRuntimeStatusText(status);

  if (
    status.scene.background.active !== 1 ||
    status.scene.background.blocked !== 1 ||
    !status.scene.cost.includes("1000 tokens") ||
    !status.scene.cost.includes("700 cached") ||
    status.scene.skills.ready < 1 ||
    status.scene.memory.assets < 1 ||
    !status.scene.memory.latestSessionMemory ||
    status.skills.ready < 1 ||
    status.memory.assets.length < 1 ||
    !text.includes("Scene:") ||
    !text.includes("Background next:") ||
    !text.includes("Cost:")
  ) {
    return {
      id,
      status: "failed",
      fact: `production scene incomplete: background=${status.scene.background.active}/${status.scene.background.blocked}, skills=${status.skills.ready}/${status.skills.total}, memory=${status.memory.assets.length}, cost=${status.scene.cost}`,
    };
  }

  return passed(
    id,
    `production scene ready: background=${status.scene.background.active}/${status.scene.background.blocked}, skills=${status.skills.ready}/${status.skills.total}, memory=${status.memory.assets.length}, cost=${status.scene.cost}`,
  );
}

function buildCostSkillFixture(): LoadedSkill {
  return {
    name: "cost-skill",
    description: "Loaded only when needed.",
    path: "skills/cost-skill/SKILL.md",
    absolutePath: "skills/cost-skill/SKILL.md",
    body: "FULL_SKILL_BODY_MUST_NOT_ENTER_DEFAULT_CONTEXT",
    dependencies: [],
    resources: [{
      path: "references/cost.md",
      size: 100_000,
      kind: "references",
    }],
    health: {
      status: "ready",
      bodyPresent: true,
      resourceCount: 1,
      dependencyCount: 0,
      resourceGroups: {
        references: 1,
        scripts: 0,
        examples: 0,
        assets: 0,
        other: 0,
      },
      issues: [],
    },
  };
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
