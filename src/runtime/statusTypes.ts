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
    assets: RuntimeMemoryAssetSummary[];
  };
  projectMap?: RuntimeProjectMapSummary;
  taskLifecycle?: RuntimeTaskLifecycleSummary;
  executions: {
    total: number;
    active: RuntimeExecutionSummary[];
    recent: RuntimeExecutionSummary[];
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

export interface RuntimeProjectMapSummary {
  rootDir: string;
  topLevelDirectories: string[];
  entryFiles: string[];
  testDirectories: string[];
  packageScripts: string[];
  specDocuments: string[];
  git: {
    available: boolean;
    hasChanges: boolean;
    recentChanges: string[];
  };
  updatedAt: string;
}

export interface RuntimeSessionSummary {
  id: string;
  title?: string;
  cwd: string;
  updatedAt: string;
  messageCount: number;
  focus?: string;
  hasMemory: boolean;
}

export interface RuntimeMemoryAssetSummary {
  id: string;
  kind: string;
  path: string;
  updatedAt?: string;
  size: number;
  evidenceRefs: string[];
}

export interface RuntimeTaskLifecycleSummary {
  id: string;
  sessionId: string;
  stage: string;
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
