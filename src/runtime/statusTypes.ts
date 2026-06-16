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
  skills: {
    total: number;
    ready: number;
    needsAttention: RuntimeSkillSummary[];
  };
  projectMap?: RuntimeProjectMapSummary;
  modelRequests: {
    recent: RuntimeModelRequestSummary[];
  };
  taskLifecycle?: RuntimeTaskLifecycleSummary;
  executions: {
    total: number;
    active: RuntimeExecutionSummary[];
    recent: RuntimeExecutionSummary[];
  };
  wakeSignals: {
    recent: RuntimeWakeSignalSummary[];
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
  contextBudget?: RuntimeContextBudgetSummary;
  workset?: {
    total: number;
    files: Array<{
      path: string;
      readCount: number;
      changedCount: number;
      lastTool: string;
      lastChangeId?: string;
      reason?: string;
    }>;
  };
}

export interface RuntimeContextBudgetSummary {
  limitChars: number;
  estimatedChars: number;
  remainingChars: number;
  usageRatio: number;
  compressed: boolean;
  compressionMode: string;
  compressionReason: string;
  sources: Array<{
    name: string;
    chars: number;
    messages?: number;
  }>;
  promptHotspots: Array<{
    layer: string;
    title: string;
    chars: number;
    lines: number;
  }>;
  cacheLayout?: {
    stablePrefixFingerprint: string;
    volatileTailFingerprint: string;
    stablePrefixChars: number;
    volatileTailChars: number;
    stableSources: string[];
    volatileSources: string[];
  };
}

export interface RuntimeModelRequestSummary {
  timestamp: string;
  provider?: string;
  model?: string;
  durationMs?: number;
  usageAvailable: boolean;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    reasoningTokens?: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
    cacheHitTokens?: number;
    cacheMissTokens?: number;
    cacheHitRate?: number;
  };
}

export interface RuntimeMemoryAssetSummary {
  id: string;
  kind: string;
  title?: string;
  path: string;
  updatedAt?: string;
  size: number;
  evidenceRefs: string[];
  scope?: string;
  tags: string[];
}

export interface RuntimeSkillSummary {
  name: string;
  path: string;
  status: string;
  resources: number;
  dependencies: number;
  issues: string[];
}

export interface RuntimeTaskLifecycleSummary {
  id: string;
  sessionId: string;
  stage: string;
  reason?: string;
  activeExecutionIds: string[];
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
  command?: string;
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

