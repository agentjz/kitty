export interface RuntimeStatus {
  rootDir: string;
  stateDir: string;
  config?: RuntimeConfigSummary;
  capabilities?: Array<{
    id: string;
    kind: string;
    enabled: boolean;
    status: string;
    message?: string;
  }>;
  scene: RuntimeSceneSummary;
  sessions: {
    total: number;
    latest?: RuntimeSessionSummary;
    recent: RuntimeSessionSummary[];
    skipped: number;
  };
  skills: {
    total: number;
    ready: number;
    items: RuntimeSkillSummary[];
    needsAttention: RuntimeSkillSummary[];
  };
  events: {
    recent: RuntimeSessionEventSummary[];
  };
  projectMap?: RuntimeProjectMapSummary;
  modelRequests: {
    recent: RuntimeModelRequestSummary[];
  };
  toolOutputs: {
    recent: RuntimeToolOutputSummary[];
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

export interface RuntimeConfigSummary {
  provider: string;
  model: string;
  baseUrl: string;
  profile: string;
  thinking?: string;
  reasoningEffort?: string;
  showReasoning: boolean;
  enabledCapabilities: string[];
}

export interface RuntimeSessionEventSummary {
  type: string;
  createdAt: string;
  host?: string;
  message?: string;
  toolName?: string;
  error?: string;
}

export interface RuntimeSceneSummary {
  headline: string;
  focus: string;
  nextAction: string;
  blocked: string;
  cost: string;
  toolOutputs: string;
  recovery: string;
  skills: {
    ready: number;
    total: number;
    nextAction: string;
  };
  background: {
    active: number;
    blocked: number;
    nextAction: string;
  };
  executions: RuntimeExecutionSceneSummary[];
}

export interface RuntimeExecutionSceneSummary {
  id: string;
  kind: string;
  status: string;
  health: string;
  risk: "none" | "watch" | "blocked";
  summary: string;
  nextAction: string;
  lastOutput?: string;
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

export interface RuntimeToolOutputSummary {
  timestamp: string;
  toolName?: string;
  kind?: string;
  mode?: string;
  rawChars?: number;
  projectedChars?: number;
  rawTokens?: number;
  projectedTokens?: number;
  savedTokens?: number;
  savingsRatio?: number;
  truncated: boolean;
  outputPath?: string;
  degraded: boolean;
  reason?: string;
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
  requestedBy: string;
  pid?: number;
  command?: string;
  cwd: string;
  summary?: string;
  outputPreview?: string;
  health?: RuntimeExecutionHealth;
  deadlineAt?: string;
  lastOutputAt?: string;
  closeReason?: string;
  terminatedBy?: string;
  error?: string;
  updatedAt: string;
}

export interface RuntimeExecutionHealth {
  state: "running" | "settled" | "no_output" | "lost" | "deadline_passed";
  message: string;
}

export interface RuntimeWakeSignalSummary {
  id: string;
  executionId: string;
  reason: string;
  createdAt: string;
}

