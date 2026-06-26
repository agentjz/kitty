import { inspectConfigPreflight } from "../config/preflight.js";
import { resolveRuntimeConfig } from "../config/store.js";
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

export const PRODUCTION_EVALUATION_CHECK_IDS: readonly ProductionEvaluationCheckId[] = [
  "production-config-preflight",
  "production-provider-probe",
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
    id: "production-runtime-status",
    suite: "production",
    title: "真实项目现场可审阅",
    userPath: "维护者显式运行生产验收时，可以确认当前项目 status 能读取 session、execution、memory、skills、cache 事实。",
    evidence: "在当前项目构建 runtime status，并确认 scene、sessions、executions、memory 和 skills 可审阅。",
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
  } else {
    checks.push({
      id: "production-provider-probe",
      status: "skipped",
      fact: "production provider probe skipped because project config is not ready",
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
      case "production-runtime-status": {
        const status = await buildRuntimeStatus(rootDir);
        return passed(
          id,
          `production runtime status ready: sessions=${status.sessions.total}, executions=${status.executions.total}, memory=${status.memory.assets.length}, skills=${status.skills.total}, headline="${status.scene.headline}", next="${status.scene.nextAction}"`,
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
