import type { RuntimeStatus } from "../../runtime/status.js";
import { truncateCliValue } from "../cliValues.js";
import { DEFAULT_LOCALE, translate, type KittyLocale, type MessageKey } from "../../i18n/index.js";

export function formatRuntimeStatusText(
  status: RuntimeStatus,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  const lines: string[] = [];

  lines.push(`${translate(locale, "status.project")}: ${status.rootDir}`);
  lines.push(`${translate(locale, "status.state")}: ${status.stateDir}`);
  lines.push("");
  lines.push(`${translate(locale, "status.currentScene")}:`);
  lines.push(`- ${translate(locale, "status.now")}: ${status.scene.headline}`);
  lines.push(`- ${translate(locale, "status.focus")}: ${status.scene.focus}`);
  lines.push(`- ${translate(locale, "status.next")}: ${status.scene.nextAction}`);
  lines.push(`- ${translate(locale, "status.blocked")}: ${status.scene.blocked}`);
  lines.push(`- ${translate(locale, "status.background")}: ${readBackgroundSceneLine(status, locale)}`);
  lines.push(`- ${translate(locale, "status.skills")}: ${readSkillsSceneLine(status, locale)}`);
  lines.push(`- ${translate(locale, "status.cost")}: ${status.scene.cost}`);
  lines.push(`- ${translate(locale, "status.toolOutput")}: ${status.scene.toolOutputs}`);
  lines.push(`- ${translate(locale, "status.recovery")}: ${status.scene.recovery}`);
  lines.push("");
  lines.push(`${translate(locale, "status.runtimeFacts")}:`);
  lines.push(`- ${translate(locale, "status.session")}: ${readSessionLine(status, locale)}`);
  if (status.sessions.skipped > 0) {
    lines.push(`- ${translate(locale, "status.sessions")}: ${translate(locale, "status.totalSkipped", {
      total: status.sessions.total,
      skipped: status.sessions.skipped,
    })}`);
  }
  lines.push(`- ${translate(locale, "status.contextBudget")}: ${readContextBudgetLine(status, locale)}`);
  lines.push(`- ${translate(locale, "status.workset")}: ${status.sessions.latest?.workset ? translate(locale, "status.files", { count: status.sessions.latest.workset.total }) : translate(locale, "common.none")}`);
  lines.push(`- ${translate(locale, "status.skills")}: ${translate(locale, "status.readyCount", { ready: status.skills.ready, total: status.skills.total })}`);
  lines.push(`- ${translate(locale, "status.modelCache")}: ${readModelCacheLine(status, locale)}`);
  lines.push(`- ${translate(locale, "status.projectOrientation")}: ${translate(locale, status.projectMap ? "common.ready" : "common.missing")}`);
  lines.push(`- ${translate(locale, "status.executions")}: ${translate(locale, "status.activeTotal", { active: status.executions.active.length, total: status.executions.total })}`);
  lines.push(`- ${translate(locale, "status.wakeSignals")}: ${status.wakeSignals.recent.length}`);

  if (status.taskLifecycle) {
    lines.push("");
    lines.push(`${translate(locale, "status.taskFacts")}:`);
    lines.push([
      status.taskLifecycle.stage,
      status.taskLifecycle.reason ? formatFact(locale, "status.label.reason", status.taskLifecycle.reason) : undefined,
      status.taskLifecycle.updatedAt,
    ].filter(Boolean).join("  "));
  }

  if (status.sessions.latest) {
    lines.push("");
    lines.push(`${translate(locale, "status.latestSession")}:`);
    lines.push([
      status.sessions.latest.id,
      status.sessions.latest.title ?? translate(locale, "common.untitled"),
      formatFact(locale, "status.label.messages", status.sessions.latest.messageCount),
    ].join("  "));
  }

  if (status.projectMap) {
    lines.push("");
    lines.push(`${translate(locale, "status.projectFacts")}:`);
    lines.push([
      formatFact(locale, "status.label.directories", status.projectMap.topLevelDirectories.slice(0, 6).join(", ") || translate(locale, "common.none")),
      formatFact(locale, "status.label.scripts", status.projectMap.packageScripts.slice(0, 6).join(", ") || translate(locale, "common.none")),
      formatFact(locale, "status.label.tests", status.projectMap.testDirectories.slice(0, 4).join(", ") || translate(locale, "common.none")),
      status.projectMap.git.available
        ? formatFact(locale, "status.label.git", translate(locale, status.projectMap.git.hasChanges ? "common.changed" : "common.clean"))
        : formatFact(locale, "status.label.git", translate(locale, "common.unavailable")),
    ].join("  "));
  }

  if (status.sessions.latest?.workset?.files.length) {
    lines.push("");
    lines.push(`${translate(locale, "status.workset")}:`);
    for (const file of status.sessions.latest.workset.files) {
      lines.push([
        file.path,
        formatFact(locale, "status.label.read", file.readCount),
        formatFact(locale, "status.label.changed", file.changedCount),
        formatFact(locale, "status.label.lastTool", file.lastTool),
        file.lastChangeId ? formatFact(locale, "status.label.change", file.lastChangeId) : undefined,
        file.reason ? formatFact(locale, "status.label.reason", file.reason) : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.sessions.latest?.contextBudget?.promptHotspots.length) {
    lines.push("");
    lines.push(`${translate(locale, "status.hotspots")}:`);
    for (const hotspot of status.sessions.latest.contextBudget.promptHotspots.slice(0, 3)) {
      lines.push([
        hotspot.layer,
        hotspot.title,
        formatFact(locale, "status.label.chars", hotspot.chars),
        formatFact(locale, "status.label.lines", hotspot.lines),
      ].join("  "));
    }
  }

  if (status.sessions.latest?.contextBudget?.sources.length) {
    lines.push("");
    lines.push(`${translate(locale, "status.sources")}:`);
    for (const source of status.sessions.latest.contextBudget.sources) {
      lines.push([
        source.name,
        formatFact(locale, "status.label.chars", source.chars),
        source.messages === undefined ? undefined : formatFact(locale, "status.label.messages", source.messages),
      ].filter(Boolean).join("  "));
    }
  }

  if (status.sessions.latest?.contextBudget?.cacheLayout) {
    const layout = status.sessions.latest.contextBudget.cacheLayout;
    const totalChars = layout.stablePrefixChars + layout.volatileTailChars;
    const stableRatio = totalChars > 0
      ? `${Math.round((layout.stablePrefixChars / totalChars) * 100)}%`
      : translate(locale, "common.unknown");
    lines.push("");
    lines.push(`${translate(locale, "status.cacheLayout")}:`);
    lines.push([
      formatFact(locale, "status.label.stable", layout.stablePrefixFingerprint),
      formatFact(locale, "status.label.stableChars", layout.stablePrefixChars),
      formatFact(locale, "status.label.tail", layout.volatileTailFingerprint),
      formatFact(locale, "status.label.tailChars", layout.volatileTailChars),
      formatFact(locale, "status.label.stableRatio", stableRatio),
    ].join("  "));
    lines.push([
      formatFact(locale, "status.label.stableSources", layout.stableSources.join(",") || translate(locale, "common.none")),
      formatFact(locale, "status.label.volatileSources", layout.volatileSources.join(",") || translate(locale, "common.none")),
    ].join("  "));
  }

  if (status.modelRequests.recent.length > 0) {
    lines.push("");
    lines.push(`${translate(locale, "status.modelRequests")}:`);
    for (const request of status.modelRequests.recent.slice(0, 5)) {
      lines.push([
        request.model ?? `${translate(locale, "common.unknown")}-model`,
        request.provider ? formatFact(locale, "status.label.provider", request.provider) : undefined,
        request.durationMs === undefined ? undefined : formatFact(locale, "status.label.duration", `${request.durationMs}ms`),
        request.usage ? formatUsage(request.usage, locale) : formatFact(locale, "status.label.usage", translate(locale, "status.usageUnavailable")),
      ].filter(Boolean).join("  "));
    }
  }

  if (status.toolOutputs.recent.length > 0) {
    lines.push("");
    lines.push(`${translate(locale, "status.toolOutputs")}:`);
    for (const output of status.toolOutputs.recent.slice(0, 5)) {
      lines.push([
        output.toolName ?? "tool",
        output.kind ? formatFact(locale, "status.label.kind", output.kind) : undefined,
        output.mode ? formatFact(locale, "status.label.mode", output.mode) : undefined,
        output.rawTokens === undefined ? undefined : formatFact(locale, "status.label.raw", output.rawTokens),
        output.projectedTokens === undefined ? undefined : formatFact(locale, "status.label.projected", output.projectedTokens),
        output.savedTokens === undefined ? undefined : formatFact(locale, "status.label.saved", output.savedTokens),
        output.savingsRatio === undefined ? undefined : formatFact(locale, "status.label.savedRatio", `${Math.round(output.savingsRatio * 100)}%`),
        output.truncated ? formatFact(locale, "status.label.recoverable", translate(locale, "common.yes")) : undefined,
        output.degraded ? formatFact(locale, "status.label.degraded", translate(locale, "common.yes")) : undefined,
        output.outputPath ? formatFact(locale, "status.label.fullOutput", truncateCliValue(output.outputPath, 80)) : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.scene.executions.length > 0) {
    lines.push("");
    lines.push(`${translate(locale, "status.delegatedScene")}:`);
    for (const execution of status.scene.executions) {
      lines.push([
        execution.id,
        execution.kind,
        execution.status,
        formatFact(locale, "status.label.risk", execution.risk),
        formatFact(locale, "status.label.summary", truncateCliValue(execution.summary, 80)),
        formatFact(locale, "status.label.next", execution.nextAction),
      ].filter(Boolean).join("  "));
      if (execution.lastOutput) {
        lines.push(`  ${formatFact(locale, "status.label.lastOutput", execution.lastOutput)}`);
      }
    }
  }

  if (status.executions.recent.length > 0) {
    lines.push("");
    lines.push(`${translate(locale, "status.recentExecutions")}:`);
    for (const execution of status.executions.recent.slice(0, 5)) {
      lines.push([
        execution.id,
        execution.kind,
        execution.status,
        execution.actorName ? formatFact(locale, "status.label.actor", execution.actorName) : undefined,
        execution.summary ? truncateCliValue(execution.summary, 80) : undefined,
        execution.assignment?.expectedOutput ? formatFact(locale, "status.label.expected", truncateCliValue(execution.assignment.expectedOutput, 60)) : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.skills.needsAttention.length > 0) {
    lines.push("");
    lines.push(`${translate(locale, "status.skillsAttention")}:`);
    for (const skill of status.skills.needsAttention) {
      lines.push([
        skill.name,
        skill.path,
        formatFact(locale, "status.label.resources", skill.resources),
        formatFact(locale, "status.label.dependencies", skill.dependencies),
        skill.issues.length > 0 ? formatFact(locale, "status.label.issues", skill.issues.join("; ")) : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  return `${lines.join("\n")}\n`;
}

function readSessionLine(status: RuntimeStatus, locale: KittyLocale): string {
  if (!status.sessions.latest) {
    return translate(locale, "common.none");
  }
  return `${status.sessions.latest.id} (${translate(locale, "status.messageCount", { count: status.sessions.latest.messageCount })})`;
}

function readBackgroundSceneLine(status: RuntimeStatus, locale: KittyLocale): string {
  const { active, blocked, nextAction } = status.scene.background;
  if (active === 0) {
    return nextAction;
  }
  return `${translate(locale, "status.activeTotal", { active, total: active })}${blocked > 0 ? `, ${translate(locale, "status.blockedCount", { count: blocked })}` : ""}; ${nextAction}`;
}

function readSkillsSceneLine(status: RuntimeStatus, locale: KittyLocale): string {
  return `${translate(locale, "status.readyCount", { ready: status.scene.skills.ready, total: status.scene.skills.total })}; ${status.scene.skills.nextAction}`;
}

function readContextBudgetLine(status: RuntimeStatus, locale: KittyLocale): string {
  const budget = status.sessions.latest?.contextBudget;
  if (!budget) {
    return translate(locale, "common.none");
  }
  const percent = Math.round(budget.usageRatio * 100);
  return [
    formatFact(locale, "status.label.chars", `${budget.estimatedChars}/${budget.limitChars}`),
    `${percent}%`,
    budget.compressed
      ? translate(locale, "status.compressed", { mode: budget.compressionMode })
      : translate(locale, "status.notCompressed"),
    formatFact(locale, "status.label.reason", budget.compressionReason),
  ].join("  ");
}

function readModelCacheLine(status: RuntimeStatus, locale: KittyLocale): string {
  const latest = status.modelRequests.recent[0];
  if (!latest) {
    return translate(locale, "common.none");
  }
  if (!latest.usage) {
    return translate(locale, latest.usageAvailable ? "status.usageUnavailable" : "status.usageProviderUnavailable");
  }
  const cacheTokens = latest.usage.cacheHitTokens ?? latest.usage.cacheReadTokens;
  const missTokens = latest.usage.cacheMissTokens;
  const rate = latest.usage.cacheHitRate === undefined
    ? undefined
    : `${Math.round(latest.usage.cacheHitRate * 100)}%`;
  return [
    formatFact(locale, "status.label.cached", cacheTokens === undefined ? translate(locale, "common.unknown") : cacheTokens),
    missTokens === undefined ? undefined : formatFact(locale, "status.label.cacheMiss", missTokens),
    rate ? formatFact(locale, "status.label.cacheHit", rate) : undefined,
  ].filter(Boolean).join("  ");
}

function formatUsage(
  usage: NonNullable<RuntimeStatus["modelRequests"]["recent"][number]["usage"]>,
  locale: KittyLocale,
): string {
  return [
    usage.inputTokens === undefined ? undefined : formatFact(locale, "status.label.input", usage.inputTokens),
    usage.outputTokens === undefined ? undefined : formatFact(locale, "status.label.output", usage.outputTokens),
    usage.reasoningTokens === undefined ? undefined : formatFact(locale, "status.label.reasoning", usage.reasoningTokens),
    usage.cacheHitTokens === undefined ? undefined : formatFact(locale, "status.label.cached", usage.cacheHitTokens),
    usage.cacheReadTokens === undefined ? undefined : formatFact(locale, "status.label.cacheRead", usage.cacheReadTokens),
    usage.cacheCreationTokens === undefined ? undefined : formatFact(locale, "status.label.cacheWrite", usage.cacheCreationTokens),
    usage.cacheMissTokens === undefined ? undefined : formatFact(locale, "status.label.cacheMiss", usage.cacheMissTokens),
    usage.cacheHitRate === undefined ? undefined : formatFact(locale, "status.label.cacheHit", `${Math.round(usage.cacheHitRate * 100)}%`),
  ].filter(Boolean).join(" ");
}

function formatFact(
  locale: KittyLocale,
  labelKey: MessageKey,
  value: string | number,
): string {
  return `${translate(locale, labelKey)}=${value}`;
}
