import { ControlPlaneLedger, type ExecutionRecord, type TeamMemberRecord, type WakeSignalRecord } from "../control/ledger.js";
import { getProjectStatePaths } from "../project/statePaths.js";
import { listRuntimeMemoryAssets } from "./memoryAssets.js";
import { SessionStore } from "../session/store.js";
import { SpecStore } from "../spec/store.js";
import type { SessionRecord } from "../types.js";

export interface RuntimeStatus {
  rootDir: string;
  stateDir: string;
  sessions: {
    total: number;
    latest?: RuntimeSessionSummary;
    recent: RuntimeSessionSummary[];
    skipped: number;
  };
  memory: {
    sessions: RuntimeMemoryAssetSummary[];
  };
  executions: {
    total: number;
    active: RuntimeExecutionSummary[];
    recent: RuntimeExecutionSummary[];
  };
  team: {
    members: RuntimeTeamMemberSummary[];
  };
  wakeSignals: {
    recent: RuntimeWakeSignalSummary[];
  };
  specs: {
    total: number;
    active: RuntimeSpecSummary[];
    recent: RuntimeSpecSummary[];
  };
}

export interface RuntimeSessionSummary {
  id: string;
  title?: string;
  cwd: string;
  updatedAt: string;
  messageCount: number;
  objective?: string;
  hasMemory: boolean;
}

export interface RuntimeMemoryAssetSummary {
  sessionId: string;
  path: string;
  updatedAt?: string;
  size: number;
}

export interface RuntimeExecutionSummary {
  id: string;
  kind: string;
  status: string;
  assignment?: {
    objective?: string;
    boundary?: string;
    expectedOutput?: string;
  };
  actorName?: string;
  actorRole?: string;
  requestedBy: string;
  sessionId?: string;
  pid?: number;
  cwd: string;
  waitPolicy?: string;
  summary?: string;
  outputPreview?: string;
  health?: RuntimeExecutionHealth;
  updatedAt: string;
}

export interface RuntimeExecutionHealth {
  state: "running" | "settled" | "no_output" | "stale";
  message: string;
}

export interface RuntimeTeamMemberSummary {
  name: string;
  role: string;
  status: string;
  executionId?: string;
  sessionId?: string;
  updatedAt: string;
}

export interface RuntimeWakeSignalSummary {
  id: string;
  executionId: string;
  reason: string;
  createdAt: string;
}

export interface RuntimeSpecSummary {
  id: string;
  title: string;
  stage: string;
  status: string;
  updatedAt: string;
  workspace?: string;
}

const DEFAULT_RECENT_LIMIT = 10;

export async function buildRuntimeStatus(rootDir: string): Promise<RuntimeStatus> {
  const paths = getProjectStatePaths(rootDir);
  const sessionStore = new SessionStore(paths.sessionsDir, {
    memorySessionsDir: paths.sessionMemoryDir,
  });

  const [sessionRead, memoryAssets, control, specs] = await Promise.all([
    sessionStore.listReadable?.(DEFAULT_RECENT_LIMIT) ?? sessionStore.list(DEFAULT_RECENT_LIMIT).then((sessions) => ({ sessions, skipped: [] })),
    listRuntimeMemoryAssets(paths.rootDir),
    readControlPlaneStatus(paths.rootDir),
    readSpecStatus(paths.rootDir),
  ]);

  const sessions = sessionRead.sessions.map(summarizeSession);

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
      sessions: memoryAssets,
    },
    executions: control.executions,
    team: control.team,
    wakeSignals: control.wakeSignals,
    specs,
  };
}

function summarizeSession(session: SessionRecord): RuntimeSessionSummary {
  return {
    id: session.id,
    title: session.title,
    cwd: session.cwd,
    updatedAt: session.updatedAt,
    messageCount: session.messageCount,
    objective: session.taskState?.objective ?? session.checkpoint?.objective,
    hasMemory: Boolean(session.sessionMemory?.summary.trim()),
  };
}

function readControlPlaneStatus(rootDir: string): {
  executions: RuntimeStatus["executions"];
  team: RuntimeStatus["team"];
  wakeSignals: RuntimeStatus["wakeSignals"];
} {
  const ledger = new ControlPlaneLedger(rootDir);
  try {
    const executions = ledger.executions.list();
    const reconciledMembers = reconcileTeamMembers(ledger.team.listMembers(), executions);
    const recent = executions
      .map(summarizeExecution)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, DEFAULT_RECENT_LIMIT);
    return {
      executions: {
        total: executions.length,
        active: executions.filter(isActiveExecution).map(summarizeExecution),
        recent,
      },
      team: {
        members: reconciledMembers.map(summarizeTeamMember),
      },
      wakeSignals: {
        recent: ledger.wakeSignals.list().map(summarizeWakeSignal).slice(0, DEFAULT_RECENT_LIMIT),
      },
    };
  } finally {
    ledger.close();
  }
}

function reconcileTeamMembers(
  members: TeamMemberRecord[],
  executions: ExecutionRecord[],
): TeamMemberRecord[] {
  const executionById = new Map(executions.map((execution) => [execution.id, execution]));
  return members.map((member) => {
    if (!member.executionId || member.status !== "working") {
      return member;
    }
    const execution = executionById.get(member.executionId);
    if (!execution || isActiveExecution(execution)) {
      return member;
    }
    return {
      ...member,
      status: "idle",
      updatedAt: execution.updatedAt,
    };
  });
}

async function readSpecStatus(rootDir: string): Promise<RuntimeStatus["specs"]> {
  const specs = await new SpecStore(rootDir, { rootDir }).list(DEFAULT_RECENT_LIMIT).catch(() => []);
  const summaries = specs.map((spec) => ({
    id: spec.id,
    title: spec.title,
    stage: spec.stage,
    status: spec.status,
    updatedAt: spec.updatedAt,
    workspace: spec.workspace?.path,
  }));
  return {
    total: summaries.length,
    active: summaries.filter((spec) => spec.status === "active"),
    recent: summaries,
  };
}

function summarizeExecution(execution: ExecutionRecord): RuntimeExecutionSummary {
  return {
    id: execution.id,
    kind: execution.kind,
    status: execution.status,
    assignment: execution.assignment,
    actorName: execution.actorName,
    actorRole: execution.actorRole,
    requestedBy: execution.requestedBy,
    sessionId: execution.sessionId,
    pid: execution.pid,
    cwd: execution.cwd,
    waitPolicy: execution.waitPolicy?.lead,
    summary: execution.summary,
    outputPreview: execution.output ? truncateExecutionOutput(execution.output) : undefined,
    health: summarizeExecutionHealth(execution),
    updatedAt: execution.updatedAt,
  };
}

function summarizeTeamMember(member: TeamMemberRecord): RuntimeTeamMemberSummary {
  return {
    name: member.name,
    role: member.role,
    status: member.status,
    executionId: member.executionId,
    sessionId: member.sessionId,
    updatedAt: member.updatedAt,
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

function isActiveExecution(execution: ExecutionRecord): boolean {
  return execution.status === "created" || execution.status === "running" || execution.status === "paused";
}

function summarizeExecutionHealth(execution: ExecutionRecord): RuntimeExecutionHealth {
  if (execution.status === "stale") {
    return {
      state: "stale",
      message: "Execution process disappeared before a normal closeout.",
    };
  }
  if (!isActiveExecution(execution)) {
    return {
      state: "settled",
      message: `Execution finished with status ${execution.status}.`,
    };
  }
  if (execution.kind === "background" && execution.status === "running" && !execution.output && !execution.summary) {
    return {
      state: "no_output",
      message: "Background execution is running but has not published output yet.",
    };
  }
  return {
    state: "running",
    message: `Execution is ${execution.status}.`,
  };
}

function truncateExecutionOutput(value: string): string {
  const normalized = value.trim();
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 240)}...`;
}
