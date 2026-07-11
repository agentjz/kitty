import fs from "node:fs/promises";
import path from "node:path";

import { ControlPlaneLedger, type ExecutionRecord, type WakeSignalRecord } from "../control/ledger.js";
import { reconcileExecutions } from "../execution/lifecycle.js";
import type { TaskLifecycleRecord } from "../control/ledger.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { buildProjectMap } from "../project/map.js";
import { listRuntimeMemoryAssets } from "./memory/index.js";
import { loadProjectContext } from "../context/projectContext.js";
import { summarizeExecution, summarizeExecutionSet } from "./executionSummary.js";
import { buildRuntimeScene } from "./scene.js";
import { SessionStore } from "../session/store.js";
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

export type { RuntimeStatus } from "./statusTypes.js";

const DEFAULT_RECENT_LIMIT = 10;

export async function buildRuntimeStatus(rootDir: string): Promise<RuntimeStatus> {
  const paths = getProjectStatePaths(rootDir);
  const sessionStore = new SessionStore(paths.sessionsDir, {
    memorySessionsDir: paths.sessionMemoryDir,
  });

  const [sessionRead, memoryAssets, control, projectMap, projectContext, modelRequests, toolOutputs] = await Promise.all([
    sessionStore.listReadable?.(DEFAULT_RECENT_LIMIT) ?? sessionStore.list(DEFAULT_RECENT_LIMIT).then((sessions) => ({ sessions, skipped: [] })),
    listRuntimeMemoryAssets(paths.rootDir),
    readControlPlaneStatus(paths.rootDir),
    buildProjectMap(paths.rootDir),
    loadProjectContext(paths.rootDir, { projectDocMaxBytes: 24_576 }),
    readRecentModelRequests(paths.observabilityEventsDir),
    readRecentToolOutputs(paths.observabilityEventsDir),
  ]);

  const sessions = sessionRead.sessions.map(summarizeSession);
  const taskLifecycle = sessions[0] ? readTaskLifecycleStatus(paths.rootDir, sessions[0].id) : undefined;

  const statusWithoutScene = {
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
    modelRequests: {
      recent: modelRequests,
    },
    toolOutputs: {
      recent: toolOutputs,
    },
    taskLifecycle,
    executions: control.executions,
    wakeSignals: control.wakeSignals,
  };

  return {
    ...statusWithoutScene,
    scene: buildRuntimeScene(statusWithoutScene),
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

async function readRecentModelRequests(eventsDir: string): Promise<RuntimeModelRequestSummary[]> {
  const files = await fs.readdir(eventsDir).catch(() => []);
  const jsonlFiles = files
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .slice(-3);
  const records: RuntimeModelRequestSummary[] = [];

  for (const file of jsonlFiles) {
    const content = await fs.readFile(path.join(eventsDir, file), "utf8").catch(() => "");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const record = parseObservabilityRecord(line);
      if (!record || record.event !== "model.request" || record.status !== "completed") {
        continue;
      }
      records.push(summarizeModelRequest(record));
    }
  }

  return records.slice(-DEFAULT_RECENT_LIMIT).reverse();
}

async function readRecentToolOutputs(eventsDir: string): Promise<RuntimeToolOutputSummary[]> {
  const files = await fs.readdir(eventsDir).catch(() => []);
  const jsonlFiles = files
    .filter((file) => file.endsWith(".jsonl"))
    .sort()
    .slice(-3);
  const records: RuntimeToolOutputSummary[] = [];

  for (const file of jsonlFiles) {
    const content = await fs.readFile(path.join(eventsDir, file), "utf8").catch(() => "");
    for (const line of content.split(/\r?\n/)) {
      if (!line.trim()) {
        continue;
      }
      const record = parseObservabilityRecord(line);
      if (!record || record.event !== "tool.output") {
        continue;
      }
      records.push(summarizeToolOutput(record));
    }
  }

  return records.slice(-DEFAULT_RECENT_LIMIT).reverse();
}

function parseObservabilityRecord(line: string): ObservabilityEventRecord | undefined {
  try {
    const parsed = JSON.parse(line) as ObservabilityEventRecord;
    return parsed && typeof parsed === "object" ? parsed : undefined;
  } catch {
    return undefined;
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

function readControlPlaneStatus(rootDir: string): {
  executions: RuntimeStatus["executions"];
  wakeSignals: RuntimeStatus["wakeSignals"];
} {
  reconcileExecutions(rootDir);
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    const executions = ledger.executions.list();
    return {
      executions: summarizeExecutionSet(executions, { recentLimit: DEFAULT_RECENT_LIMIT }),
      wakeSignals: {
        recent: ledger.wakeSignals.list()
          .slice(-DEFAULT_RECENT_LIMIT)
          .reverse()
          .map(summarizeWakeSignal),
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
