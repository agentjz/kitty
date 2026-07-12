import type {
  RuntimeExecutionSceneSummary,
  RuntimeExecutionSummary,
  RuntimeSceneSummary,
  RuntimeStatus,
} from "./statusTypes.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";

type RuntimeStatusFacts = Omit<RuntimeStatus, "scene">;

export function buildRuntimeScene(
  status: RuntimeStatusFacts,
  locale: KittyLocale = DEFAULT_LOCALE,
): RuntimeSceneSummary {
  const executions = readSceneExecutions(status, locale);
  const blockedExecutions = executions.filter((execution) => execution.risk === "blocked");
  const watchExecutions = executions.filter((execution) => execution.risk === "watch");
  const activeBackground = executions.filter((execution) => execution.kind === "background");
  const blockedBackground = activeBackground.filter((execution) => execution.risk !== "none");

  return {
    headline: buildHeadline(status, blockedExecutions, watchExecutions, locale),
    focus: readFocus(status, locale),
    nextAction: readNextAction(status, blockedExecutions, watchExecutions, locale),
    blocked: readBlocked(blockedExecutions, locale),
    cost: readCost(status, locale),
    toolOutputs: readToolOutputs(status, locale),
    recovery: readRecovery(status, executions, locale),
    skills: {
      ready: status.skills.ready,
      total: status.skills.total,
      nextAction: readSkillsNextAction(status, locale),
    },
    background: {
      active: activeBackground.length,
      blocked: blockedBackground.length,
      nextAction: readBackgroundNextAction(activeBackground, locale),
    },
    executions,
  };
}

function readSceneExecutions(status: RuntimeStatusFacts, locale: KittyLocale): RuntimeExecutionSceneSummary[] {
  const byId = new Map<string, RuntimeExecutionSceneSummary>();
  for (const execution of status.executions.active) {
    byId.set(execution.id, buildExecutionScene(execution, locale));
  }
  for (const execution of status.executions.recent) {
    const scene = buildExecutionScene(execution, locale);
    if (scene.risk !== "none" && !byId.has(scene.id)) {
      byId.set(scene.id, scene);
    }
  }
  return [...byId.values()];
}

export function buildExecutionScene(
  execution: RuntimeExecutionSummary,
  locale: KittyLocale = DEFAULT_LOCALE,
): RuntimeExecutionSceneSummary {
  const risk = readExecutionRisk(execution);
  return {
    id: execution.id,
    kind: execution.kind,
    status: execution.status,
    health: execution.health?.message ?? translate(locale, "scene.executionState", { status: execution.status }),
    risk,
    summary: readExecutionSummary(execution, locale),
    nextAction: readExecutionNextAction(execution, risk, locale),
    lastOutput: execution.outputPreview ? truncateText(execution.outputPreview, 160) : undefined,
  };
}

function buildHeadline(
  status: RuntimeStatusFacts,
  blockedExecutions: RuntimeExecutionSceneSummary[],
  watchExecutions: RuntimeExecutionSceneSummary[],
  locale: KittyLocale,
): string {
  if (blockedExecutions.length > 0) {
    return blockedExecutions.length === 1
      ? translate(locale, "scene.headline.blockedOne")
      : translate(locale, "scene.headline.blockedMany", { count: blockedExecutions.length });
  }
  if (watchExecutions.length > 0) {
    return watchExecutions.length === 1
      ? translate(locale, "scene.headline.watchOne")
      : translate(locale, "scene.headline.watchMany", { count: watchExecutions.length });
  }
  if (status.executions.active.length > 0) {
    return status.executions.active.length === 1
      ? translate(locale, "scene.headline.activeOne")
      : translate(locale, "scene.headline.activeMany", { count: status.executions.active.length });
  }
  if (!status.sessions.latest) {
    return translate(locale, "scene.headline.noSession");
  }
  return translate(locale, "scene.headline.ready");
}

function readFocus(status: RuntimeStatusFacts, locale: KittyLocale): string {
  const focus = status.sessions.latest?.focus;
  if (focus) {
    return truncateText(focus, 120);
  }
  const title = status.sessions.latest?.title;
  if (title) {
    return truncateText(title, 120);
  }
  return translate(locale, "scene.noFocus");
}

function readNextAction(
  status: RuntimeStatusFacts,
  blockedExecutions: RuntimeExecutionSceneSummary[],
  watchExecutions: RuntimeExecutionSceneSummary[],
  locale: KittyLocale,
): string {
  const urgent = blockedExecutions[0] ?? watchExecutions[0];
  if (urgent) {
    return urgent.nextAction;
  }
  if (status.executions.active.length > 0) {
    return translate(locale, "scene.next.wait");
  }
  if (!status.sessions.latest) {
    return translate(locale, "scene.next.start");
  }
  return translate(locale, "scene.next.continue");
}

function readBlocked(blockedExecutions: RuntimeExecutionSceneSummary[], locale: KittyLocale): string {
  if (blockedExecutions.length === 0) {
    return translate(locale, "scene.noBlockers");
  }
  return blockedExecutions
    .slice(0, 3)
    .map((execution) => `${readExecutionKindLabel(execution.kind, locale)} ${execution.id}: ${execution.health}`)
    .join(" | ");
}

function readCost(status: RuntimeStatusFacts, locale: KittyLocale): string {
  const budget = status.sessions.latest?.contextBudget;
  const latest = status.modelRequests.recent[0];
  const budgetText = budget
    ? translate(locale, "scene.cost.context", {
        percent: Math.round(budget.usageRatio * 100),
        compressed: budget.compressed ? translate(locale, "scene.cost.compressed") : "",
      })
    : translate(locale, "scene.contextUnmeasured");
  const layout = budget?.cacheLayout;
  const layoutText = layout
    ? translate(locale, "scene.cost.stable", { ratio: readStableRatio(layout.stablePrefixChars, layout.volatileTailChars) })
    : undefined;
  const usageText = latest?.usage
    ? readUsageCost(latest.usage, locale)
    : latest
      ? translate(locale, "scene.providerUsageUnavailable")
      : translate(locale, "scene.noModelRequest");
  return [budgetText, layoutText, usageText].filter(Boolean).join("; ");
}

function readToolOutputs(status: RuntimeStatusFacts, locale: KittyLocale): string {
  const recent = status.toolOutputs.recent;
  if (recent.length === 0) {
    return translate(locale, "scene.noToolProjection");
  }

  const saved = recent.reduce((total, item) => total + (item.savedTokens ?? 0), 0);
  const truncated = recent.filter((item) => item.truncated).length;
  const degraded = recent.filter((item) => item.degraded).length;
  const best = recent
    .filter((item) => typeof item.savedTokens === "number")
    .sort((a, b) => (b.savedTokens ?? 0) - (a.savedTokens ?? 0))[0];

  return [
    translate(locale, "scene.tool.recent", { count: recent.length }),
    translate(locale, "scene.tool.saved", { count: saved }),
    truncated > 0 ? translate(locale, "scene.tool.recoverable", { count: truncated }) : undefined,
    degraded > 0 ? translate(locale, "scene.tool.degraded", { count: degraded }) : undefined,
    best ? `top=${best.toolName ?? "tool"}:${best.kind ?? "output"}` : undefined,
  ].filter(Boolean).join("; ");
}

function readStableRatio(stableChars: number, volatileChars: number): string {
  const total = stableChars + volatileChars;
  return total > 0 ? `${Math.round((stableChars / total) * 100)}%` : "not measured";
}

function readUsageCost(
  usage: NonNullable<RuntimeStatus["modelRequests"]["recent"][number]["usage"]>,
  locale: KittyLocale,
): string {
  const cached = usage.cacheHitTokens ?? usage.cacheReadTokens;
  const hitRate = usage.cacheHitRate === undefined
    ? undefined
    : translate(locale, "scene.cost.cacheHit", { percent: Math.round(usage.cacheHitRate * 100) });
  return [
    usage.totalTokens === undefined ? undefined : translate(locale, "scene.cost.totalTokens", { count: usage.totalTokens }),
    cached === undefined ? translate(locale, "scene.cost.cacheUnknown") : translate(locale, "scene.cost.cached", { count: cached }),
    hitRate,
  ].filter(Boolean).join(", ");
}

function readRecovery(
  status: RuntimeStatusFacts,
  executions: RuntimeExecutionSceneSummary[],
  locale: KittyLocale,
): string {
  const risky = executions.filter((execution) => execution.risk !== "none").length;
  if (risky > 0) {
    return risky === 1
      ? translate(locale, "scene.recoveryOne")
      : translate(locale, "scene.recoveryMany", { count: risky });
  }
  if (status.wakeSignals.recent.length > 0) {
    return status.wakeSignals.recent.length === 1
      ? translate(locale, "scene.wakeOne")
      : translate(locale, "scene.wakeMany", { count: status.wakeSignals.recent.length });
  }
  return translate(locale, "scene.recoveryClear");
}

function readSkillsNextAction(status: RuntimeStatusFacts, locale: KittyLocale): string {
  if (status.skills.total === 0) {
    return translate(locale, "scene.noSkills");
  }
  if (status.skills.needsAttention.length > 0) {
    return translate(locale, "scene.skillIssues");
  }
  return translate(locale, "scene.skillsReady");
}

function readBackgroundNextAction(backgrounds: RuntimeExecutionSceneSummary[], locale: KittyLocale): string {
  if (backgrounds.length === 0) {
    return translate(locale, "scene.noBackground");
  }
  const blocked = backgrounds.find((execution) => execution.risk === "blocked");
  if (blocked) {
    return blocked.nextAction;
  }
  const watch = backgrounds.find((execution) => execution.risk === "watch");
  if (watch) {
    return watch.nextAction;
  }
  return translate(locale, "scene.backgroundRunning");
}

function readExecutionRisk(execution: RuntimeExecutionSummary): RuntimeExecutionSceneSummary["risk"] {
  switch (execution.health?.state) {
    case "deadline_passed":
    case "lost":
      return "blocked";
    case "no_output":
      return "watch";
    case "running":
    case "settled":
    case undefined:
      return "none";
  }
}

function readExecutionSummary(execution: RuntimeExecutionSummary, locale: KittyLocale): string {
  if (execution.summary) {
    return truncateText(execution.summary, 120);
  }
  if (execution.command) {
    return truncateText(execution.command, 120);
  }
  return translate(locale, "scene.executionTask", { kind: readExecutionKindLabel(execution.kind, locale) });
}

function readExecutionNextAction(
  execution: RuntimeExecutionSummary,
  risk: RuntimeExecutionSceneSummary["risk"],
  locale: KittyLocale,
): string {
  if (risk === "blocked") return translate(locale, "scene.execution.backgroundBlocked", { id: execution.id });
  if (risk === "watch") return translate(locale, "scene.execution.backgroundWatch", { id: execution.id });
  return translate(locale, "scene.execution.backgroundActive", { id: execution.id });
}

function readExecutionKindLabel(kind: string, locale: KittyLocale): string {
  switch (kind) {
    case "background":
      return translate(locale, "scene.kind.background");
    default:
      return translate(locale, "scene.kind.background");
  }
}

function truncateText(value: string, maxChars: number): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= maxChars) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(0, maxChars - 3))}...`;
}
