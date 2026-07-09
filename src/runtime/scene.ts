import type {
  RuntimeExecutionSceneSummary,
  RuntimeExecutionSummary,
  RuntimeSceneSummary,
  RuntimeStatus,
} from "./statusTypes.js";

type RuntimeStatusFacts = Omit<RuntimeStatus, "scene">;

export function buildRuntimeScene(status: RuntimeStatusFacts): RuntimeSceneSummary {
  const executions = readSceneExecutions(status);
  const blockedExecutions = executions.filter((execution) => execution.risk === "blocked");
  const watchExecutions = executions.filter((execution) => execution.risk === "watch");
  const activeBackground = executions.filter((execution) => execution.kind === "background");
  const blockedBackground = activeBackground.filter((execution) => execution.risk !== "none");

  return {
    headline: buildHeadline(status, blockedExecutions, watchExecutions),
    focus: readFocus(status),
    nextAction: readNextAction(status, blockedExecutions, watchExecutions),
    blocked: readBlocked(blockedExecutions),
    cost: readCost(status),
    toolOutputs: readToolOutputs(status),
    recovery: readRecovery(status, executions),
    skills: {
      ready: status.skills.ready,
      total: status.skills.total,
      nextAction: readSkillsNextAction(status),
    },
    memory: {
      assets: status.memory.assets.length,
      latestSessionMemory: Boolean(status.sessions.latest?.hasMemory),
      nextAction: readMemoryNextAction(status),
    },
    background: {
      active: activeBackground.length,
      blocked: blockedBackground.length,
      nextAction: readBackgroundNextAction(activeBackground),
    },
    executions,
  };
}

function readSceneExecutions(status: RuntimeStatusFacts): RuntimeExecutionSceneSummary[] {
  const byId = new Map<string, RuntimeExecutionSceneSummary>();
  for (const execution of status.executions.active) {
    byId.set(execution.id, buildExecutionScene(execution));
  }
  for (const execution of status.executions.recent) {
    const scene = buildExecutionScene(execution);
    if (scene.risk !== "none" && !byId.has(scene.id)) {
      byId.set(scene.id, scene);
    }
  }
  return [...byId.values()];
}

export function buildExecutionScene(execution: RuntimeExecutionSummary): RuntimeExecutionSceneSummary {
  const risk = readExecutionRisk(execution);
  return {
    id: execution.id,
    kind: execution.kind,
    status: execution.status,
    health: execution.health?.message ?? `Execution is ${execution.status}.`,
    risk,
    summary: readExecutionSummary(execution),
    nextAction: readExecutionNextAction(execution, risk),
    lastOutput: execution.outputPreview ? truncateText(execution.outputPreview, 160) : undefined,
  };
}

function buildHeadline(
  status: RuntimeStatusFacts,
  blockedExecutions: RuntimeExecutionSceneSummary[],
  watchExecutions: RuntimeExecutionSceneSummary[],
): string {
  if (blockedExecutions.length > 0) {
    return blockedExecutions.length === 1
      ? "One delegated task needs attention."
      : `${blockedExecutions.length} delegated tasks need attention.`;
  }
  if (watchExecutions.length > 0) {
    return watchExecutions.length === 1
      ? "One delegated task is running without output yet."
      : `${watchExecutions.length} delegated tasks are running without output yet.`;
  }
  if (status.executions.active.length > 0) {
    return status.executions.active.length === 1
      ? "One delegated task is running."
      : `${status.executions.active.length} delegated tasks are running.`;
  }
  if (!status.sessions.latest) {
    return "No session has started yet.";
  }
  return "Latest session is ready.";
}

function readFocus(status: RuntimeStatusFacts): string {
  const focus = status.sessions.latest?.focus;
  if (focus) {
    return truncateText(focus, 120);
  }
  const title = status.sessions.latest?.title;
  if (title) {
    return truncateText(title, 120);
  }
  return "No current focus yet.";
}

function readNextAction(
  status: RuntimeStatusFacts,
  blockedExecutions: RuntimeExecutionSceneSummary[],
  watchExecutions: RuntimeExecutionSceneSummary[],
): string {
  const urgent = blockedExecutions[0] ?? watchExecutions[0];
  if (urgent) {
    return urgent.nextAction;
  }
  if (status.executions.active.length > 0) {
    return "Wait for the active task, or inspect it with `kitty status` / `kitty execution`.";
  }
  if (!status.sessions.latest) {
    return "Start a session with `kitty`.";
  }
  return "Continue from the latest session.";
}

function readBlocked(blockedExecutions: RuntimeExecutionSceneSummary[]): string {
  if (blockedExecutions.length === 0) {
    return "No blockers visible.";
  }
  return blockedExecutions
    .slice(0, 3)
    .map((execution) => `${readExecutionKindLabel(execution.kind)} ${execution.id}: ${execution.health}`)
    .join(" | ");
}

function readCost(status: RuntimeStatusFacts): string {
  const budget = status.sessions.latest?.contextBudget;
  const latest = status.modelRequests.recent[0];
  const budgetText = budget
    ? `${Math.round(budget.usageRatio * 100)}% context${budget.compressed ? ", compressed" : ""}`
    : "Context has not been measured yet";
  const layout = budget?.cacheLayout;
  const layoutText = layout
    ? `stable ${readStableRatio(layout.stablePrefixChars, layout.volatileTailChars)}`
    : undefined;
  const usageText = latest?.usage
    ? readUsageCost(latest.usage)
    : latest
      ? "provider usage unavailable"
      : "No model request recorded yet";
  return [budgetText, layoutText, usageText].filter(Boolean).join("; ");
}

function readToolOutputs(status: RuntimeStatusFacts): string {
  const recent = status.toolOutputs.recent;
  if (recent.length === 0) {
    return "Tool output has not needed projection yet";
  }

  const saved = recent.reduce((total, item) => total + (item.savedTokens ?? 0), 0);
  const truncated = recent.filter((item) => item.truncated).length;
  const degraded = recent.filter((item) => item.degraded).length;
  const best = recent
    .filter((item) => typeof item.savedTokens === "number")
    .sort((a, b) => (b.savedTokens ?? 0) - (a.savedTokens ?? 0))[0];

  return [
    `${recent.length} recent`,
    `${saved} tokens saved est.`,
    truncated > 0 ? `${truncated} recoverable` : undefined,
    degraded > 0 ? `${degraded} degraded` : undefined,
    best ? `top=${best.toolName ?? "tool"}:${best.kind ?? "output"}` : undefined,
  ].filter(Boolean).join("; ");
}

function readStableRatio(stableChars: number, volatileChars: number): string {
  const total = stableChars + volatileChars;
  return total > 0 ? `${Math.round((stableChars / total) * 100)}%` : "not measured";
}

function readUsageCost(usage: NonNullable<RuntimeStatus["modelRequests"]["recent"][number]["usage"]>): string {
  const cached = usage.cacheHitTokens ?? usage.cacheReadTokens;
  const hitRate = usage.cacheHitRate === undefined ? undefined : `${Math.round(usage.cacheHitRate * 100)}% hit`;
  return [
    usage.totalTokens === undefined ? undefined : `${usage.totalTokens} tokens`,
    cached === undefined ? "cache unknown" : `${cached} cached`,
    hitRate,
  ].filter(Boolean).join(", ");
}

function readRecovery(status: RuntimeStatusFacts, executions: RuntimeExecutionSceneSummary[]): string {
  const risky = executions.filter((execution) => execution.risk !== "none").length;
  if (risky > 0) {
    return risky === 1
      ? "One delegated task needs recovery attention."
      : `${risky} delegated tasks need recovery attention.`;
  }
  if (status.wakeSignals.recent.length > 0) {
    return status.wakeSignals.recent.length === 1
      ? "One wake signal is recorded."
      : `${status.wakeSignals.recent.length} wake signals are recorded.`;
  }
  return "Recovery is clear.";
}

function readSkillsNextAction(status: RuntimeStatusFacts): string {
  if (status.skills.total === 0) {
    return "No runtime skills are discovered in this project.";
  }
  if (status.skills.needsAttention.length > 0) {
    return "Inspect skill issues before relying on those skills.";
  }
  return "Skills are ready; load full skill content only when needed.";
}

function readMemoryNextAction(status: RuntimeStatusFacts): string {
  if (!status.sessions.latest) {
    return "Memory will appear after a session produces useful continuity.";
  }
  if (!status.sessions.latest.hasMemory && status.memory.assets.length === 0) {
    return "Continue the session until useful memory is saved.";
  }
  if (!status.sessions.latest.hasMemory && status.memory.assets.length > 0) {
    return "Review memory assets when prior evidence is needed.";
  }
  return "Session memory is available; use assets only when needed.";
}

function readBackgroundNextAction(backgrounds: RuntimeExecutionSceneSummary[]): string {
  if (backgrounds.length === 0) {
    return "No background work is running.";
  }
  const blocked = backgrounds.find((execution) => execution.risk === "blocked");
  if (blocked) {
    return blocked.nextAction;
  }
  const watch = backgrounds.find((execution) => execution.risk === "watch");
  if (watch) {
    return watch.nextAction;
  }
  return "Background work is running; wait or inspect latest output.";
}

function readExecutionRisk(execution: RuntimeExecutionSummary): RuntimeExecutionSceneSummary["risk"] {
  switch (execution.health?.state) {
    case "deadline_passed":
    case "stale":
      return "blocked";
    case "no_output":
      return "watch";
    case "running":
    case "settled":
    case undefined:
      return "none";
  }
}

function readExecutionSummary(execution: RuntimeExecutionSummary): string {
  if (execution.assignment?.objective) {
    return truncateText(execution.assignment.objective, 120);
  }
  if (execution.summary) {
    return truncateText(execution.summary, 120);
  }
  if (execution.command) {
    return truncateText(execution.command, 120);
  }
  return `${readExecutionKindLabel(execution.kind)} task`;
}

function readExecutionNextAction(
  execution: RuntimeExecutionSummary,
  risk: RuntimeExecutionSceneSummary["risk"],
): string {
  if (execution.kind === "background") {
    if (risk === "blocked") {
      return `Inspect output with \`kitty background read ${execution.id}\` or stop with \`kitty background stop ${execution.id}\`.`;
    }
    if (risk === "watch") {
      return `Wait for first output or inspect with \`kitty background read ${execution.id}\`.`;
    }
    return `Inspect with \`kitty background read ${execution.id}\` or \`kitty background wait ${execution.id}\` if you need the result now.`;
  }
  if (risk === "blocked") {
    return `Inspect ${readExecutionKindLabel(execution.kind)} ${execution.id} before continuing.`;
  }
  if (risk === "watch") {
    return `Watch ${readExecutionKindLabel(execution.kind)} ${execution.id} for output or deadline.`;
  }
  if (execution.waitPolicy === "while_execution_active") {
    return "Lead should wait for this task to finish.";
  }
  return "Task is active.";
}

function readExecutionKindLabel(kind: string): string {
  switch (kind) {
    case "background":
      return "background";
    case "subagent":
      return "subagent";
    default:
      return "delegated";
  }
}

function truncateText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}
