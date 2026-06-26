import type { EvaluationCheckId, EvaluationCheckResult } from "./types.js";
import { passed } from "./types.js";
import {
  EVALUATION_SCENARIOS,
  listEvaluationChecks,
  listEvaluationScenarios,
  LOCAL_EVALUATION_CHECK_IDS,
} from "./scenarios.js";
import { runCacheEconomyCheck, runToolOutputGovernanceCheck } from "./costAndOutputChecks.js";
import { runProductionSceneCheck } from "./sceneCheck.js";
import {
  runHostTurnBoundaryCheck,
  runRecoveryDrillsCheck,
  runRemoteEntrypointsCheck,
} from "./hostAndRecoveryChecks.js";

export {
  EVALUATION_SCENARIOS,
  listEvaluationChecks,
  listEvaluationScenarios,
  LOCAL_EVALUATION_CHECK_IDS,
};

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
