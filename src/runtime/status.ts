import { ControlPlaneLedger, type ExecutionRecord, type WakeSignalRecord } from "../control/ledger.js";
import { reconcileExecutions } from "../execution/lifecycle.js";
import type { TaskLifecycleRecord } from "../control/ledger.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { buildProjectMap } from "../project/map.js";
import { loadProjectContext } from "../context/projectContext.js";
import { summarizeExecutionSet } from "./executionSummary.js";
import { buildRuntimeScene } from "./scene.js";
import type { SessionRecord } from "../types.js";
import type {
  ObservabilityEventRecord,
} from "../observability/schema.js";
import type {
  RuntimeExecutionSummary,
  RuntimeModelRequestSummary,
  RuntimeProjectMapSummary,
  RuntimeSessionSummary,
  RuntimeStatus,
  RuntimeTaskLifecycleSummary,
  RuntimeToolOutputSummary,
  RuntimeWakeSignalSummary,
} from "./statusTypes.js";
import { DEFAULT_LOCALE, type KittyLocale } from "../i18n/index.js";

export type { RuntimeStatus } from "./statusTypes.js";

const DEFAULT_RECENT_LIMIT = 10;

export async function buildRuntimeStatus(
  rootDir: string,
  locale: KittyLocale = DEFAULT_LOCALE,
): Promise<RuntimeStatus> {
  const paths = getProjectStatePaths(rootDir);
  reconcileExecutions(paths.rootDir);
  const durable = readRuntimeLedgerSnapshot(paths.rootDir);

  const [projectMap, projectContext] = await Promise.all([
    buildProjectMap(paths.rootDir),
    loadProjectContext(paths.rootDir, { projectDocMaxBytes: 24_576 }),
  ]);

  const sessions = durable.sessions.map(summarizeSession);
  const modelRequests = durable.events
    .filter((record) => record.event === "model.request" && record.status === "completed")
    .slice(0, DEFAULT_RECENT_LIMIT)
    .map(summarizeModelRequest);
  const toolOutputs = durable.events
    .filter((record) => record.event === "tool.output")
    .slice(0, DEFAULT_RECENT_LIMIT)
    .map(summarizeToolOutput);

  const statusWithoutScene = {
    rootDir: paths.rootDir,
    stateDir: paths.kittyDir,
    sessions: {
      total: sessions.length,
      latest: sessions[0],
      recent: sessions,
      skipped: 0,
    },
    skills: summarizeSkills(projectContext.skills),
    projectMap: summarizeProjectMap(projectMap),
    modelRequests: {
      recent: modelRequests,
    },
    toolOutputs: {
      recent: toolOutputs,
    },
    taskLifecycle: durable.taskLifecycle ? summarizeTaskLifecycle(durable.taskLifecycle) : undefined,
    executions: summarizeExecutionSet(durable.executions, { recentLimit: DEFAULT_RECENT_LIMIT }),
    wakeSignals: {
      recent: durable.wakeSignals.slice(-DEFAULT_RECENT_LIMIT).reverse().map(summarizeWakeSignal),
    },
  };

  return {
    ...statusWithoutScene,
    scene: buildRuntimeScene(statusWithoutScene, locale),
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
      cacheLayout: session.contextBudget.cacheLayout,
    } : undefined,
    workset: session.workset ? {
      total: session.workset.files.length,
      files: session.workset.files.slice(-10).map((file) => ({
        path: file.path,
        readCount: file.readCount,
        changedCount: file.changedCount,
        lastTool: file.lastTool,
        lastChangeId: file.lastChangeId,
        reason: file.reason,
      })),
    } : undefined,
  };
}

function readRuntimeLedgerSnapshot(rootDir: string): {
  sessions: SessionRecord[];
  taskLifecycle?: TaskLifecycleRecord;
  executions: ExecutionRecord[];
  wakeSignals: WakeSignalRecord[];
  events: ObservabilityEventRecord[];
} {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    return ledger.transaction(() => {
      const sessions = ledger.sessions.list(DEFAULT_RECENT_LIMIT);
      return {
        sessions,
        taskLifecycle: sessions[0] ? ledger.taskLifecycle.loadCurrent(sessions[0].id) : undefined,
        executions: ledger.executions.list(),
        wakeSignals: ledger.wakeSignals.list(),
        events: ledger.runtimeEvents.list(200),
      };
    });
  } finally {
    ledger.close();
  }
}

function summarizeModelRequest(record: ObservabilityEventRecord): RuntimeModelRequestSummary {
  const details = record.details ?? {};
  const usage = readUsageSummary(details.usage);
  return {
    timestamp: record.timestamp,
    provider: typeof details.provider === "string" ? details.provider : undefined,
    model: record.model,
    durationMs: record.durationMs,
    usageAvailable: typeof details.usageAvailable === "boolean" ? details.usageAvailable : Boolean(usage),
    usage,
  };
}

function summarizeToolOutput(record: ObservabilityEventRecord): RuntimeToolOutputSummary {
  const details = record.details ?? {};
  return {
    timestamp: record.timestamp,
    toolName: record.toolName,
    kind: readString(details.kind),
    mode: readString(details.mode),
    rawChars: readNumber(details.rawChars),
    projectedChars: readNumber(details.projectedChars),
    rawTokens: readNumber(details.rawTokens),
    projectedTokens: readNumber(details.projectedTokens),
    savedTokens: readNumber(details.savedTokens),
    savingsRatio: readNumber(details.savingsRatio),
    truncated: details.truncated === true,
    outputPath: readString(details.outputPath),
    degraded: details.degraded === true,
    reason: readString(details.reason),
  };
}

function readUsageSummary(value: unknown): RuntimeModelRequestSummary["usage"] | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  const usage = {
    inputTokens: readNumber(record.inputTokens),
    outputTokens: readNumber(record.outputTokens),
    totalTokens: readNumber(record.totalTokens),
    reasoningTokens: readNumber(record.reasoningTokens),
    cacheReadTokens: readNumber(record.cacheReadTokens),
    cacheCreationTokens: readNumber(record.cacheCreationTokens),
    cacheHitTokens: readNumber(record.cacheHitTokens),
    cacheMissTokens: readNumber(record.cacheMissTokens),
    cacheHitRate: readNumber(record.cacheHitRate),
  };
  return Object.values(usage).some((item) => typeof item === "number") ? usage : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
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

function summarizeTaskLifecycle(lifecycle: TaskLifecycleRecord): RuntimeTaskLifecycleSummary {
  return {
    id: lifecycle.id,
    sessionId: lifecycle.sessionId,
    stage: lifecycle.stage,
    reason: lifecycle.reason,
    activeExecutionIds: lifecycle.activeExecutionIds,
    activeTodoIds: lifecycle.activeTodoIds,
    verificationFacts: lifecycle.verificationFacts,
    completionFacts: lifecycle.completionFacts,
    updatedAt: lifecycle.updatedAt,
    completedAt: lifecycle.completedAt,
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
