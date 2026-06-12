import { ControlPlaneLedger, type ExecutionRecord, type WakeSignalRecord } from "../control/ledger.js";
import type { TaskLifecycleRecord } from "../control/ledger.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { buildProjectMap } from "../project/map.js";
import { listRuntimeMemoryAssets } from "./memory/index.js";
import { loadProjectContext } from "../context/projectContext.js";
import { summarizeExecution, summarizeExecutionSet } from "./executionSummary.js";
import { SessionStore } from "../session/store.js";
import { SpecStore } from "../spec/store.js";
import { buildSpecWorkflowSummary } from "../spec/workflowSummary.js";
import type { SessionRecord } from "../types.js";
import type {
  RuntimeExecutionSummary,
  RuntimeProjectMapSummary,
  RuntimeSessionSummary,
  RuntimeStatus,
  RuntimeTaskLifecycleSummary,
  RuntimeWakeSignalSummary,
} from "./statusTypes.js";

export type { RuntimeStatus } from "./statusTypes.js";

const DEFAULT_RECENT_LIMIT = 10;

export async function buildRuntimeStatus(rootDir: string): Promise<RuntimeStatus> {
  const paths = getProjectStatePaths(rootDir);
  const sessionStore = new SessionStore(paths.sessionsDir, {
    memorySessionsDir: paths.sessionMemoryDir,
  });

  const [sessionRead, memoryAssets, control, specs, projectMap, projectContext] = await Promise.all([
    sessionStore.listReadable?.(DEFAULT_RECENT_LIMIT) ?? sessionStore.list(DEFAULT_RECENT_LIMIT).then((sessions) => ({ sessions, skipped: [] })),
    listRuntimeMemoryAssets(paths.rootDir),
    readControlPlaneStatus(paths.rootDir),
    readSpecStatus(paths.rootDir),
    buildProjectMap(paths.rootDir),
    loadProjectContext(paths.rootDir, { projectDocMaxBytes: 24_576 }),
  ]);

  const sessions = sessionRead.sessions.map(summarizeSession);
  const taskLifecycle = sessions[0] ? readTaskLifecycleStatus(paths.rootDir, sessions[0].id) : undefined;

  return {
    rootDir: paths.rootDir,
    stateDir: paths.kittyDir,
    sessions: {
      total: sessions.length,
      latest: sessions[0],
      recent: sessions,
      skipped: sessionRead.skipped.length,
    },
    memory: {
      assets: memoryAssets,
    },
    skills: summarizeSkills(projectContext.skills),
    projectMap: summarizeProjectMap(projectMap),
    taskLifecycle,
    executions: control.executions,
    wakeSignals: control.wakeSignals,
    specs,
  };
}

function summarizeProjectMap(projectMap: Awaited<ReturnType<typeof buildProjectMap>>): RuntimeProjectMapSummary {
  return {
    rootDir: projectMap.rootDir,
    topLevelDirectories: projectMap.topLevelDirectories,
    entryFiles: projectMap.entryFiles,
    testDirectories: projectMap.testDirectories,
    packageScripts: projectMap.packageScripts,
    specDocuments: projectMap.specDocuments,
    git: projectMap.git,
    updatedAt: projectMap.updatedAt,
  };
}

function summarizeSession(session: SessionRecord): RuntimeSessionSummary {
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    focus: session.taskState?.focus ?? session.checkpoint?.focus,
    hasMemory: Boolean(session.sessionMemory?.summary.trim()),
    contextBudget: session.contextBudget ? {
      limitChars: session.contextBudget.limitChars,
      estimatedChars: session.contextBudget.estimatedChars,
      remainingChars: session.contextBudget.remainingChars,
      usageRatio: session.contextBudget.usageRatio,
      compressed: session.contextBudget.compressed,
      compressionMode: session.contextBudget.compressionMode,
      compressionReason: session.contextBudget.compressionReason,
      sources: session.contextBudget.sources,
      promptHotspots: session.contextBudget.promptHotspots,
    } : undefined,
  };
}

function summarizeSkills(skills: Awaited<ReturnType<typeof loadProjectContext>>["skills"]): RuntimeStatus["skills"] {
  const summaries = skills.map((skill) => ({
    name: skill.name,
    path: skill.path,
    status: skill.health.status,
    resources: skill.health.resourceCount,
    dependencies: skill.health.dependencyCount,
    issues: skill.health.issues,
  }));
  return {
    total: summaries.length,
    ready: summaries.filter((skill) => skill.status === "ready").length,
    needsAttention: summaries.filter((skill) => skill.status !== "ready"),
  };
}

function readControlPlaneStatus(rootDir: string): {
  executions: RuntimeStatus["executions"];
  wakeSignals: RuntimeStatus["wakeSignals"];
} {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    const executions = ledger.executions.list();
    return {
      executions: summarizeExecutionSet(executions, { recentLimit: DEFAULT_RECENT_LIMIT }),
      wakeSignals: {
        recent: ledger.wakeSignals.list().map(summarizeWakeSignal).slice(0, DEFAULT_RECENT_LIMIT),
      },
    };
  } finally {
    ledger.close();
  }
}

function readTaskLifecycleStatus(rootDir: string, sessionId: string): RuntimeTaskLifecycleSummary | undefined {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    const lifecycle = ledger.taskLifecycle.loadCurrent(sessionId);
    return lifecycle ? summarizeTaskLifecycle(lifecycle) : undefined;
  } finally {
    ledger.close();
  }
}

function summarizeTaskLifecycle(lifecycle: TaskLifecycleRecord): RuntimeTaskLifecycleSummary {
  return {
    id: lifecycle.id,
    sessionId: lifecycle.sessionId,
    stage: lifecycle.stage,
    reason: lifecycle.reason,
    activeExecutionIds: lifecycle.activeExecutionIds,
    activeSpecId: lifecycle.activeSpecId,
    activeTodoIds: lifecycle.activeTodoIds,
    verificationFacts: lifecycle.verificationFacts,
    completionFacts: lifecycle.completionFacts,
    updatedAt: lifecycle.updatedAt,
    completedAt: lifecycle.completedAt,
  };
}

async function readSpecStatus(rootDir: string): Promise<RuntimeStatus["specs"]> {
  const store = new SpecStore(rootDir, { rootDir });
  const specs = await store.list(DEFAULT_RECENT_LIMIT).catch(() => []);
  const summaries = await Promise.all(specs.map(async (spec) => {
    const state = await store.load(spec.id).catch(() => null);
    const documents = state ? await store.readAllDocuments(state.id).catch(() => undefined) : undefined;
    const workflow = buildSpecWorkflowSummary({ spec: state, documents });
    return {
    id: spec.id,
    title: spec.title,
    stage: spec.stage,
    status: spec.status,
    updatedAt: spec.updatedAt,
    workspace: spec.workspace?.path,
    workflow: {
      nextGate: workflow.nextGate,
      stageLabel: workflow.stageLabel,
      nextAction: workflow.nextAction,
      waitingFor: workflow.waitingFor,
      writableTools: workflow.writableTools,
      documentProgress: workflow.documentProgress,
      confirmed: workflow.confirmed,
      documents: workflow.documents,
    },
  };
  }));
  return {
    total: summaries.length,
    active: summaries.filter((spec) => spec.status === "active"),
    recent: summaries,
  };
}

function summarizeWakeSignal(signal: WakeSignalRecord): RuntimeWakeSignalSummary {
  return {
    id: signal.id,
    executionId: signal.executionId,
    reason: signal.reason,
    createdAt: signal.createdAt,
  };
}
