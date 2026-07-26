import { inspectConfigPreflight } from "../config/preflight.js";
import { resolveRuntimeConfig } from "../config/store.js";
import { SessionEventStore } from "../session/events.js";
import { SessionStore } from "../session/store.js";
import { runHostTurn } from "../host/turn.js";
import fs from "node:fs/promises";
import path from "node:path";
import { probeProviderConnection } from "../provider/connection.js";
import { buildRuntimeStatus } from "../runtime/status.js";
import { passed } from "./types.js";
import type {
  EvaluationCheckResult,
  EvaluationRunResult,
  EvaluationScenario,
  ProductionEvaluationCheckId,
} from "./types.js";
import { summarizeChecks } from "./types.js";
import { runProductionRepairCheck } from "./productionRepair.js";
import { runProductionBackgroundCheck } from "./productionBackground.js";
import { runProductionContextPressureCheck } from "./productionContextPressure.js";
import { runProductionBrowserCheck } from "./productionBrowser.js";
import { prepareCheckWorkspace } from "./workspace.js";

export const PRODUCTION_EVALUATION_CHECK_IDS: readonly ProductionEvaluationCheckId[] = [
  "production-config-preflight",
  "production-provider-probe",
  "production-real-turn",
  "production-context-pressure",
  "production-background-turn",
  "production-browser-turn",
  "production-tool-turn",
  "production-runtime-status",
];

export const PRODUCTION_EVALUATION_SCENARIOS: readonly EvaluationScenario[] = [
  {
    id: "production-config-preflight",
    suite: "production",
    title: "真实配置可启动",
    userPath: "维护者显式运行生产验收时，Kitty 先检查当前项目 `.kitty/.env`、模板和 provider/model contract。",
    evidence: "读取当前项目 preflight，确认 env contract、provider catalog 和下一步诊断可用。",
  },
  {
    id: "production-provider-probe",
    suite: "production",
    title: "真实 provider 可连接",
    userPath: "维护者显式运行生产验收时，Kitty 使用当前 `.kitty/.env` 探测真实 provider，不把真实消费混进日常测试。",
    evidence: "加载 runtime config，使用 provider probe 访问当前 provider，并返回 resolved base URL 与 wire API probe。",
  },
  {
    id: "production-real-turn",
    suite: "production",
    title: "真实 provider 多轮对话可完成",
    userPath: "维护者显式运行生产验收时，Kitty 用当前 provider 跑隔离 session 的两轮真实对话，验证 turn、session 和 events 主链路。",
    evidence: "创建隔离 eval workspace，运行两次 runHostTurn，确认用户/assistant 消息、turn events 和 runtime status 都可审阅。",
  },
  {
    id: "production-context-pressure",
    suite: "production",
    title: "真实长对话与上下文压力可收口",
    userPath: "维护者显式运行生产验收时，Kitty 使用当前真实 provider 连续运行长对话直到触发压缩，并验证不可压缩输入明确失败。",
    evidence: "确认多轮真实请求全部完成、context epoch 持久化、压缩后最新事实仍可回答；超大静态上下文在 provider completion 前本地失败且不产生 assistant 回复。",
  },
  {
    id: "production-background-turn",
    suite: "production",
    title: "真实 provider 后台等待可完成",
    userPath: "维护者显式运行生产验收时，Kitty 在同一 turn 启动渐进输出任务，只在进度和终态变化后继续判断。",
    evidence: "确认真实 provider 调用 background_run、至少两次 background_wait，消费 running progress 和 settled sentinel，并留下唯一 durable wake。",
  },
  {
    id: "production-browser-turn",
    suite: "production",
    title: "真实 provider 浏览器任务可完成",
    userPath: "维护者显式运行生产验收时，Kitty 让真实模型通过 Playwright 浏览器操作动态页面，并把页面最终事实写入隔离工作区。",
    evidence: "确认真实 provider 调用 Playwright navigate/click/type、消费动态页面事实、写入结果文件，并留下 tool.completed/turn.completed 事件。",
  },
  {
    id: "production-tool-turn",
    suite: "production",
    title: "真实 provider 修复任务可完成",
    userPath: "维护者显式运行生产验收时，Kitty 在隔离缺陷工作区中真实读文件、运行失败验证、修改目标、复验通过并完成收口。",
    evidence: "确认失败根因来自工具结果尾部、真实修改落盘、第二次验证通过、最终回答消费 sentinel，且 tool.failed/tool.completed/turn.completed 事件闭环。",
  },
  {
    id: "production-runtime-status",
    suite: "production",
    title: "真实项目现场可审阅",
    userPath: "维护者显式运行生产验收时，可以确认当前项目 status 能读取 session、execution、skills 和 cache 事实。",
    evidence: "在当前项目构建 runtime status，并确认 scene、sessions、executions 和 skills 可审阅。",
  },
];

export function listProductionEvaluationChecks(): ProductionEvaluationCheckId[] {
  return [...PRODUCTION_EVALUATION_CHECK_IDS];
}

export function listProductionEvaluationScenarios(): EvaluationScenario[] {
  return [...PRODUCTION_EVALUATION_SCENARIOS];
}

export async function runProductionEvaluationChecks(rootDir: string): Promise<EvaluationRunResult> {
  const checks: EvaluationCheckResult[] = [];
  const preflight = await runProductionEvaluationCheck("production-config-preflight", rootDir);
  checks.push(preflight);
  if (preflight.status === "passed") {
    checks.push(await runProductionEvaluationCheck("production-provider-probe", rootDir));
    checks.push(await runProductionEvaluationCheck("production-real-turn", rootDir));
    checks.push(await runProductionEvaluationCheck("production-context-pressure", rootDir));
    checks.push(await runProductionEvaluationCheck("production-background-turn", rootDir));
    checks.push(await runProductionEvaluationCheck("production-browser-turn", rootDir));
    checks.push(await runProductionEvaluationCheck("production-tool-turn", rootDir));
  } else {
    checks.push({
      id: "production-provider-probe",
      status: "skipped",
      fact: "production provider probe skipped because project config is not ready",
    });
    checks.push({
      id: "production-real-turn",
      status: "skipped",
      fact: "production real turn skipped because project config is not ready",
    });
    checks.push({
      id: "production-context-pressure",
      status: "skipped",
      fact: "production context pressure skipped because project config is not ready",
    });
    checks.push({
      id: "production-background-turn",
      status: "skipped",
      fact: "production background turn skipped because project config is not ready",
    });
    checks.push({
      id: "production-browser-turn",
      status: "skipped",
      fact: "production browser turn skipped because project config is not ready",
    });
    checks.push({
      id: "production-tool-turn",
      status: "skipped",
      fact: "production tool turn skipped because project config is not ready",
    });
  }
  checks.push(await runProductionEvaluationCheck("production-runtime-status", rootDir));
  return {
    suite: "production",
    status: summarizeChecks(checks),
    checks,
  };
}

async function runProductionEvaluationCheck(
  id: ProductionEvaluationCheckId,
  rootDir: string,
): Promise<EvaluationCheckResult> {
  try {
    switch (id) {
      case "production-config-preflight": {
        const report = await inspectConfigPreflight(rootDir);
        if (!report.ready) {
          return {
            id,
            status: "failed",
            fact: `production config not ready: missing=${report.env.missingKeys.length}, catalog=${report.env.catalogError ?? "ok"}, apiKey=${report.env.apiKeyPresent ? "present" : "missing"}`,
          };
        }
        return passed(id, `production config ready: provider=${report.env.provider}, model=${report.env.model}, baseUrl=${report.env.baseUrl}`);
      }
      case "production-provider-probe": {
        const config = await resolveRuntimeConfig({ cwd: rootDir });
        if (!config.apiKey.trim()) {
          return {
            id,
            status: "failed",
            fact: "production provider probe blocked: KITTY_API_KEY is missing",
          };
        }
        const probe = await probeProviderConnection({
          provider: config.provider,
          model: config.model,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        });
        if (probe.kind !== "ok") {
          return {
            id,
            status: "failed",
            fact: `production provider probe failed: ${probe.message}`,
          };
        }
        return passed(id, `production provider reachable: probe=${probe.probe}, resolvedBaseUrl=${probe.resolvedBaseUrl}, timeoutMs=${probe.probeTimeoutMs}`);
      }
      case "production-real-turn": {
        return await runProductionRealTurnCheck(id, rootDir);
      }
      case "production-context-pressure": {
        return await runProductionContextPressureCheck(id, rootDir);
      }
      case "production-background-turn": {
        return await runProductionBackgroundCheck(id, rootDir);
      }
      case "production-browser-turn": {
        return await runProductionBrowserCheck(id, rootDir);
      }
      case "production-tool-turn": {
        return await runProductionRepairCheck(id, rootDir);
      }
      case "production-runtime-status": {
        const workspace = await prepareCheckWorkspace(rootDir, "production-runtime-status");
        const status = await buildRuntimeStatus(workspace);
        return passed(
          id,
          `production runtime status ready: sessions=${status.sessions.total}, executions=${status.executions.total}, skills=${status.skills.total}, headline="${status.scene.headline}", next="${status.scene.nextAction}"`,
        );
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

export async function runProductionRealTurnCheck(
  id: ProductionEvaluationCheckId,
  rootDir: string,
): Promise<EvaluationCheckResult> {
  const sourceConfig = await resolveRuntimeConfig({ cwd: rootDir });
  if (!sourceConfig.apiKey.trim()) {
    return {
      id,
      status: "failed",
      fact: "production real turn blocked: KITTY_API_KEY is missing",
    };
  }

  const workspace = await prepareProductionEvalWorkspace(rootDir);
  const config = {
    ...sourceConfig,
    paths: {
      ...sourceConfig.paths,
      dataDir: path.join(workspace, ".kitty"),
      sessionsDir: path.join(workspace, ".kitty", "sessions"),
      changesDir: path.join(workspace, ".kitty", "changes"),
      eventsDir: path.join(workspace, ".kitty", "events"),
    },
    maxOutputTokens: Math.min(sourceConfig.maxOutputTokens, 512),
    contextWindowMessages: Math.min(sourceConfig.contextWindowMessages, 20),
    maxContextChars: Math.min(sourceConfig.maxContextChars, 80_000),
    contextSummaryChars: Math.min(sourceConfig.contextSummaryChars, 8_000),
  };
  const sessionStore = new SessionStore(config.paths.sessionsDir);
  let session = await sessionStore.save(await sessionStore.create(workspace));
  const turnInputs = [
    "Answer in one short plain English sentence: say Kitty production eval turn one is ready.",
    "Answer in one short plain English sentence: say Kitty production eval turn two is ready.",
  ];
  for (const input of turnInputs) {
    const outcome = await runHostTurn({
      host: "eval-production",
      input,
      cwd: workspace,
      stateRootDir: workspace,
      config,
      session,
      sessionStore,
      builtinToolFilter: () => false,
    }, {
      createToolRegistry: async () => ({
        definitions: [],
        entries: [],
        execute: async () => ({ ok: false, output: "Production eval disables tools." }),
        close: async () => undefined,
      }),
    });
    if (outcome.status !== "completed") {
      return {
        id,
        status: "failed",
        fact: `production real turn failed: status=${outcome.status}, message=${outcome.errorMessage ?? "none"}`,
      };
    }
    session = outcome.session;
  }

  const reloaded = await sessionStore.load(session.id);
  const events = await new SessionEventStore(config.paths.eventsDir).list(session.id, 20);
  const status = await buildRuntimeStatus(workspace);
  const userMessages = reloaded.messages.filter((message) => message.role === "user" && message.source !== "internal");
  const assistantMessages = reloaded.messages.filter((message) => message.role === "assistant");
  const eventTypes = events.map((event) => event.type);
  const completedTurns = eventTypes.filter((type) => type === "turn.completed").length;

  if (userMessages.length < 2 || assistantMessages.length < 2 || completedTurns < 2 || status.sessions.total < 1) {
    return {
      id,
      status: "failed",
      fact: `production real turn incomplete: users=${userMessages.length}, assistants=${assistantMessages.length}, completedTurns=${completedTurns}, sessions=${status.sessions.total}`,
    };
  }

  return passed(
    id,
    `production real turn ready: users=${userMessages.length}, assistants=${assistantMessages.length}, completedTurns=${completedTurns}, session=${session.id}`,
  );
}

async function prepareProductionEvalWorkspace(rootDir: string, name = "real-turn"): Promise<string> {
  const workspace = path.join(rootDir, ".kitty", "eval-production", name);
  await fs.rm(workspace, { recursive: true, force: true });
  await fs.mkdir(workspace, { recursive: true });
  return workspace;
}
