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
import { prepareCheckWorkspace } from "./workspace.js";
import { executionOwnership } from "../control/types.js";

const EVAL_EXECUTION_OWNER = {
  ownerSessionId: "eval-session",
  createdBySessionId: "eval-session",
  parentTurnId: "eval-turn",
  originToolCallId: "eval-tool-call",
} as const;

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
        const workspace = await prepareCheckWorkspace(rootDir, "runtime-status");
        const status = await buildRuntimeStatus(workspace);
        return passed(id, `runtime status ready: sessions=${status.sessions.total}, executions=${status.executions.total}`);
      }
      case "project-map-builds": {
        const { buildProjectMap } = await import("../project/map.js");
        const map = await buildProjectMap(rootDir);
        return passed(id, `project map ready: dirs=${map.topLevelDirectories.length}, scripts=${map.packageScripts.length}`);
      }
      case "context-epochs-readable": {
        const { ControlPlaneLedger } = await import("../control/ledger.js");
        const workspace = await prepareCheckWorkspace(rootDir, "context-epochs");
        const ledger = new ControlPlaneLedger(workspace);
        try {
          return passed(id, `context epoch ledger readable: sessions=${ledger.sessions.list(10).length}`);
        } finally {
          ledger.close();
        }
      }
      case "capability-surface-current": {
        const { STATIC_CAPABILITY_DEFINITIONS } = await import("../capabilities/definitions.js");
        const enabled = STATIC_CAPABILITY_DEFINITIONS.filter((capability) => capability.defaultEnabled).map((capability) => capability.id);
        return passed(id, `capability surface ready: default=${enabled.join(",")}`);
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
        const workspace = await prepareCheckWorkspace(rootDir, "tool-output-governance");
        return await runToolOutputGovernanceCheck(id, workspace);
      }
      case "production-scene-ready": {
        return await runProductionSceneCheck(id, rootDir);
      }
      case "host-turn-boundary-runs": {
        return await runHostTurnBoundaryCheck(id, rootDir);
      }
      case "background-lifecycle-ready": {
        return await runBackgroundLifecycleCheck(id, rootDir);
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

async function runBackgroundLifecycleCheck(id: EvaluationCheckId, projectRootDir: string): Promise<EvaluationCheckResult> {
  const rootDir = await prepareCheckWorkspace(projectRootDir, "background-lifecycle");
  const { BackgroundExecutionStore } = await import("../execution/background.js");
  const { readExecutionOutput } = await import("../execution/output.js");
  const { buildRuntimeStatus } = await import("../runtime/status.js");

  const backgroundStore = new BackgroundExecutionStore(rootDir);
  const background = backgroundStore.create({
    ...EVAL_EXECUTION_OWNER,
    command: "eval background lifecycle",
    cwd: rootDir,
    requestedBy: "eval",
  });
  backgroundStore.close(background.id, executionOwnership(background), {
    status: "completed",
    exitCode: 0,
    output: "alpha\nbeta\n",
    summary: "beta",
  });
  const backgroundTail = readExecutionOutput({
    rootDir,
    id: background.id,
    kind: "background",
    mode: "tail",
    lines: 1,
  });
  if (backgroundTail.output !== "beta") {
    throw new Error("background output tail was not readable");
  }

  const running = backgroundStore.create({
    ...EVAL_EXECUTION_OWNER,
    command: "eval cancellable background",
    cwd: rootDir,
    requestedBy: "eval",
  });
  backgroundStore.markRunning(running.id, executionOwnership(running), { pid: process.pid });
  const cancelled = backgroundStore.close(running.id, executionOwnership(running), { status: "aborted", terminatedBy: "eval" });
  if (cancelled.status !== "aborted") {
    throw new Error("background cancel did not close execution as aborted");
  }

  const status = await buildRuntimeStatus(rootDir);
  const wakeCount = status.wakeSignals.recent.filter((signal) =>
    signal.executionId === running.id && signal.reason === "aborted").length;
  if (wakeCount === 0) {
    throw new Error("background cancel wake signal was not recorded");
  }

  return passed(id, `background lifecycle ready: executions=${status.executions.total}, wakes=${status.wakeSignals.recent.length}`);
}
