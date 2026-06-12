export interface WorkingMemoryRecentToolBatch {
  tools: string[];
  summary: string;
  changedPaths: string[];
  recordedAt: string;
}

export interface WorkingMemoryTodo {
  id: string;
  text: string;
  status: "pending" | "in_progress" | "completed";
}

export interface WorkingMemoryFile {
  path: string;
  readCount: number;
  changedCount: number;
  lastTool: string;
  lastChangeId?: string;
  reason?: string;
}

export interface AgentWorkingMemory {
  version: 1;
  focus?: string;
  focusFingerprint?: string;
  activeFiles: string[];
  plannedActions: string[];
  completedActions: string[];
  blockers: string[];
  files: WorkingMemoryFile[];
  todos: WorkingMemoryTodo[];
  recentToolBatch?: WorkingMemoryRecentToolBatch;
  checkpointPhase?: string;
  checkpointStatus?: string;
  updatedAt: string;
}
