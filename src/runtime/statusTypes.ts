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
  taskLifecycle?: RuntimeTaskLifecycleSummary;
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

export interface RuntimeTaskLifecycleSummary {
  id: string;
  sessionId: string;
  stage: string;
  objective?: string;
  reason?: string;
  activeExecutionIds: string[];
  activeSpecId?: string;
  activeTodoIds: string[];
  verificationFacts: string[];
  completionFacts: string[];
  updatedAt: string;
  completedAt?: string;
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
  deadlineAt?: string;
  lastOutputAt?: string;
  closeReason?: string;
  terminatedBy?: string;
  changedPaths: string[];
  error?: string;
  updatedAt: string;
}

export interface RuntimeExecutionHealth {
  state: "running" | "settled" | "no_output" | "stale" | "deadline_passed";
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
