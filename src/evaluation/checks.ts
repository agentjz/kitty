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
      case "background-subagent-lifecycle-ready": {
        return await runBackgroundSubagentLifecycleCheck(id, rootDir);
      }
      case "delegation-behavior-boundary-ready": {
        return await runDelegationBehaviorBoundaryCheck(id);
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

async function runDelegationBehaviorBoundaryCheck(id: EvaluationCheckId): Promise<EvaluationCheckResult> {
  const { EXTENSION_DEFINITIONS } = await import("../extensions/definitions.js");

  const background = EXTENSION_DEFINITIONS.find((definition) => definition.id === "background");
  const subagent = EXTENSION_DEFINITIONS.find((definition) => definition.id === "subagent");
  if (!background || !subagent) {
    throw new Error("background/subagent extension definitions are missing");
  }

  const backgroundSurface = readExtensionSurface(background);
  const subagentSurface = readExtensionSurface(subagent);

  assertSurfaceIncludes(backgroundSurface, [
    "long local commands",
    "without blocking",
    "output over time",
  ], "background behavior surface");
  assertSurfaceIncludes(subagentSurface, [
    "independent context",
    "simple direct edits",
    "dependent tasks",
    "shared plan",
    "independent",
  ], "subagent behavior surface");

  return passed(id, "delegation behavior boundary ready: lead direct work, background long commands, subagent independent bounded work");
}

async function runBackgroundSubagentLifecycleCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
  const { BackgroundExecutionStore } = await import("../execution/background.js");
  const { cancelExecution } = await import("../execution/lifecycle.js");
  const { readExecutionOutput } = await import("../execution/output.js");
  const { ExecutionStore } = await import("../execution/store.js");
  const { buildRuntimeStatus } = await import("../runtime/status.js");

  const backgroundStore = new BackgroundExecutionStore(rootDir);
  const background = backgroundStore.create({
    command: "eval background lifecycle",
    cwd: rootDir,
    requestedBy: "eval",
  });
  backgroundStore.close(background.id, {
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

  const executionStore = new ExecutionStore(rootDir);
  const completedSubagent = executionStore.create({
    kind: "subagent",
    prompt: "eval subagent lifecycle",
    cwd: rootDir,
    requestedBy: "lead",
    actorName: "eval-subagent",
    actorRole: "explorer",
  });
  executionStore.close(completedSubagent.id, {
    status: "completed",
    resultText: "subagent-result\n",
    summary: "subagent-result",
  });
  const subagentOutput = readExecutionOutput({
    rootDir,
    id: completedSubagent.id,
    kind: "subagent",
    mode: "summary",
  });
  if (subagentOutput.output !== "subagent-result") {
    throw new Error("subagent summary output was not readable");
  }

  const runningSubagent = executionStore.create({
    kind: "subagent",
    prompt: "eval cancellable subagent",
    cwd: rootDir,
    requestedBy: "lead",
  });
  executionStore.markRunning(runningSubagent.id, { pid: process.pid });
  const cancelled = cancelExecution(rootDir, runningSubagent.id, {
    expectedKind: "subagent",
    terminatedBy: "eval",
  });
  if (cancelled.status !== "aborted") {
    throw new Error("subagent cancel did not close execution as aborted");
  }

  const status = await buildRuntimeStatus(rootDir);
  const wakeCount = status.wakeSignals.recent.filter((signal) =>
    signal.executionId === runningSubagent.id && signal.reason === "aborted").length;
  if (wakeCount === 0) {
    throw new Error("subagent cancel wake signal was not recorded");
  }

  return passed(id, `background/subagent lifecycle ready: executions=${status.executions.total}, wakes=${status.wakeSignals.recent.length}`);
}

function readExtensionSurface(definition: {
  summary: string;
  capability: {
    description: string;
    bestFor: readonly string[];
  };
  createTools: () => readonly {
    definition: {
      function: {
        description?: string;
      };
    };
  }[];
}): string {
  const toolDescriptions = definition.createTools()
    .map((tool) => tool.definition.function.description ?? "")
    .join("\n");
  return [
    definition.summary,
    definition.capability.description,
    ...definition.capability.bestFor,
    toolDescriptions,
  ].join("\n").toLowerCase();
}

function assertSurfaceIncludes(surface: string, needles: readonly string[], label: string): void {
  for (const needle of needles) {
    if (!surface.includes(needle.toLowerCase())) {
      throw new Error(`${label} does not include '${needle}'`);
    }
  }
}
