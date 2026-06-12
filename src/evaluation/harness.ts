export interface EvaluationScenario {
  id: string;
  userExperience: string;
  machineFacts: string[];
  acceptance: string[];
  checks: EvaluationCheckId[];
}

export type EvaluationCheckId =
  | "runtime-status-builds"
  | "project-map-builds"
  | "memory-assets-readable"
  | "extension-surface-current"
  | "spec-store-available"
  | "skill-packages-readable"
  | "config-preflight-readable";

export interface EvaluationRunResult {
  scenarioId: string;
  status: "passed" | "failed" | "skipped";
  checks: EvaluationCheckResult[];
}

export interface EvaluationCheckResult {
  id: EvaluationCheckId;
  status: "passed" | "failed" | "skipped";
  fact: string;
  error?: string;
}

const EVALUATION_SCENARIOS: readonly EvaluationScenario[] = [
  {
    id: "simple-question-stays-small",
    userExperience: "A short user question receives a short answer without starting unnecessary long-running work.",
    machineFacts: [
      "context contains the current user input",
      "execution ledger has no new background or subagent execution",
      "tool calls are absent unless factual inspection is needed",
    ],
    acceptance: [
      "answer is direct",
      "no delegated execution is created",
      "no project-wide scan is triggered by default",
    ],
    checks: ["runtime-status-builds", "extension-surface-current"],
  },
  {
    id: "long-session-keeps-confirmed-facts",
    userExperience: "A long session keeps nearby conversation natural and carries older confirmed constraints through memory.",
    machineFacts: [
      "provider request keeps visible near-field conversation",
      "runtime memory asset exists",
      "context injects session memory for older continuity",
      "memory asset can be read by the user",
    ],
    acceptance: [
      "recent conversation can be recalled naturally",
      "confirmed constraint appears in session memory",
      "old focus is not treated as current focus",
    ],
    checks: ["runtime-status-builds", "memory-assets-readable"],
  },
  {
    id: "old-goal-stays-history",
    userExperience: "Previous goals stay as evidence and do not hijack the current turn.",
    machineFacts: [
      "visible near-field conversation is distinct from runtime facts",
      "internal wake is excluded from visible conversation",
      "working memory carries the active focus",
    ],
    acceptance: [
      "model answers the current request",
      "prior goals are not narrated unless asked",
      "internal facts are not presented as user intent",
    ],
    checks: ["runtime-status-builds"],
  },
  {
    id: "project-map-orients-without-judging",
    userExperience: "The agent can quickly orient itself in a project without blindly reading everything.",
    machineFacts: [
      "project map lists directories, entries, scripts, tests, specs, and git facts",
      "project map is injected as a concise fact block",
      "project map does not classify semantic importance",
    ],
    acceptance: [
      "project map is visible in status",
      "context includes concise project map facts",
      "large directory trees are not dumped into prompt",
    ],
    checks: ["project-map-builds"],
  },
  {
    id: "memory-can-be-reviewed-and-traced",
    userExperience: "The user can inspect, search, delete, and reuse saved memory.",
    machineFacts: [
      "memory assets are stored under .kitty/memory",
      "memory CLI can list/read/search/delete",
      "memory can be appended to skill references",
    ],
    acceptance: [
      "memory content is user-readable",
      "deleted memory is no longer listed",
      "skill reference records the source memory asset",
    ],
    checks: ["memory-assets-readable", "skill-packages-readable"],
  },
  {
    id: "background-can-recover-or-terminate",
    userExperience: "A background task that finishes, stalls, or fails remains visible and controllable.",
    machineFacts: [
      "execution ledger stores background status",
      "runtime status shows health and output",
      "terminate tool can close a running background execution",
    ],
    acceptance: [
      "running background appears in status",
      "stalled background has a visible health fact",
      "terminated background records close reason",
    ],
    checks: ["runtime-status-builds"],
  },
  {
    id: "subagent-wakes-lead-with-result",
    userExperience: "A subagent works in isolated context and returns a result that wakes the lead.",
    machineFacts: [
      "subagent execution has blocking wait policy",
      "worker output is written to execution summary/output",
      "wake facts are internal runtime facts",
    ],
    acceptance: [
      "lead yields while subagent is active",
      "lead resumes after completion or deadline",
      "wake facts do not become user input",
    ],
    checks: ["runtime-status-builds", "extension-surface-current"],
  },
  {
    id: "spec-workflow-completes",
    userExperience: "Spec mode can move from requirements through validation with notes and checkpoints.",
    machineFacts: [
      "spec state tracks stage and status",
      "spec documents exist",
      "checkpoint create/list/restore works",
    ],
    acceptance: [
      "requirements, design, tasks, implement, validate are represented",
      "notes preserve interview facts",
      "ordinary agent mode does not auto-enter spec mode",
    ],
    checks: ["spec-store-available", "extension-surface-current"],
  },
];

export function listEvaluationScenarios(): EvaluationScenario[] {
  return EVALUATION_SCENARIOS.map((scenario) => ({
    ...scenario,
    machineFacts: [...scenario.machineFacts],
    acceptance: [...scenario.acceptance],
    checks: [...scenario.checks],
  }));
}

export async function runEvaluationScenarios(rootDir: string): Promise<EvaluationRunResult[]> {
  const scenarios = listEvaluationScenarios();
  const cache = new Map<EvaluationCheckId, Promise<EvaluationCheckResult>>();
  return Promise.all(scenarios.map(async (scenario) => {
    const checks = await Promise.all(scenario.checks.map((check) => {
      const existing = cache.get(check);
      if (existing) {
        return existing;
      }
      const pending = runEvaluationCheck(check, rootDir);
      cache.set(check, pending);
      return pending;
    }));
    return {
      scenarioId: scenario.id,
      status: summarizeChecks(checks),
      checks,
    };
  }));
}

async function runEvaluationCheck(id: EvaluationCheckId, rootDir: string): Promise<EvaluationCheckResult> {
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
      case "spec-store-available": {
        const { SpecStore } = await import("../spec/store.js");
        const specs = await new SpecStore(rootDir, { rootDir }).list(5).catch(() => []);
        return passed(id, `spec store ready: total=${specs.length}`);
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

function passed(id: EvaluationCheckId, fact: string): EvaluationCheckResult {
  return {
    id,
    status: "passed",
    fact,
  };
}

function summarizeChecks(checks: readonly EvaluationCheckResult[]): EvaluationRunResult["status"] {
  if (checks.some((check) => check.status === "failed")) {
    return "failed";
  }
  if (checks.some((check) => check.status === "skipped")) {
    return "skipped";
  }
  return "passed";
}
