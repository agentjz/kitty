import type { RuntimeStatus } from "../../runtime/status.js";
import { truncateCliValue } from "../cliValues.js";

export function formatRuntimeStatusText(status: RuntimeStatus): string {
  const lines: string[] = [];

  lines.push(`Project: ${status.rootDir}`);
  lines.push(`State: ${status.stateDir}`);
  lines.push("");
  lines.push("Current scene:");
  lines.push(`- Now: ${status.scene.headline}`);
  lines.push(`- Focus: ${status.scene.focus}`);
  lines.push(`- Next: ${status.scene.nextAction}`);
  lines.push(`- Blocked: ${status.scene.blocked}`);
  lines.push(`- Background: ${readBackgroundSceneLine(status)}`);
  lines.push(`- Memory: ${readMemorySceneLine(status)}`);
  lines.push(`- Skills: ${readSkillsSceneLine(status)}`);
  lines.push(`- Cost: ${status.scene.cost}`);
  lines.push(`- Tool output: ${status.scene.toolOutputs}`);
  lines.push(`- Recovery: ${status.scene.recovery}`);
  lines.push("");
  lines.push("Runtime facts:");
  lines.push(`- Session: ${readSessionLine(status)}`);
  if (status.sessions.skipped > 0) {
    lines.push(`- Sessions: ${status.sessions.total} total, ${status.sessions.skipped} skipped`);
  }
  lines.push(`- Context budget: ${readContextBudgetLine(status)}`);
  lines.push(`- Workset: ${status.sessions.latest?.workset ? `${status.sessions.latest.workset.total} file(s)` : "none"}`);
  lines.push(`- Memory files: ${status.memory.assets.length > 0 ? `${status.memory.assets.length}` : "none"}`);
  lines.push(`- Skills: ${status.skills.ready}/${status.skills.total} ready`);
  lines.push(`- Model cache: ${readModelCacheLine(status)}`);
  lines.push(`- Project orientation: ${status.projectMap ? "ready" : "missing"}`);
  lines.push(`- Executions: ${status.executions.active.length} active / ${status.executions.total} total`);
  lines.push(`- Wake signals: ${status.wakeSignals.recent.length}`);

  if (status.taskLifecycle) {
    lines.push("");
    lines.push("Task facts:");
    lines.push([
      status.taskLifecycle.stage,
      status.taskLifecycle.reason ? `reason=${status.taskLifecycle.reason}` : undefined,
      status.taskLifecycle.updatedAt,
    ].filter(Boolean).join("  "));
  }

  if (status.sessions.latest) {
    lines.push("");
    lines.push("Latest session:");
    lines.push([
      status.sessions.latest.id,
      status.sessions.latest.title ?? "(untitled)",
      `messages=${status.sessions.latest.messageCount}`,
      status.sessions.latest.hasMemory ? "memory=yes" : "memory=no",
    ].join("  "));
  }

  if (status.projectMap) {
    lines.push("");
    lines.push("Project facts:");
    lines.push([
      `dirs=${status.projectMap.topLevelDirectories.slice(0, 6).join(", ") || "none"}`,
      `scripts=${status.projectMap.packageScripts.slice(0, 6).join(", ") || "none"}`,
      `tests=${status.projectMap.testDirectories.slice(0, 4).join(", ") || "none"}`,
      status.projectMap.git.available
        ? `git=${status.projectMap.git.hasChanges ? "changed" : "clean"}`
        : "git=unavailable",
    ].join("  "));
  }

  if (status.sessions.latest?.workset?.files.length) {
    lines.push("");
    lines.push("Workset:");
    for (const file of status.sessions.latest.workset.files) {
      lines.push([
        file.path,
        `read=${file.readCount}`,
        `changed=${file.changedCount}`,
        `last=${file.lastTool}`,
        file.lastChangeId ? `change=${file.lastChangeId}` : undefined,
        file.reason ? `reason=${file.reason}` : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.sessions.latest?.contextBudget?.promptHotspots.length) {
    lines.push("");
    lines.push("Context budget hotspots:");
    for (const hotspot of status.sessions.latest.contextBudget.promptHotspots.slice(0, 3)) {
      lines.push([
        hotspot.layer,
        hotspot.title,
        `chars=${hotspot.chars}`,
        `lines=${hotspot.lines}`,
      ].join("  "));
    }
  }

  if (status.sessions.latest?.contextBudget?.sources.length) {
    lines.push("");
    lines.push("Context budget sources:");
    for (const source of status.sessions.latest.contextBudget.sources) {
      lines.push([
        source.name,
        `chars=${source.chars}`,
        source.messages === undefined ? undefined : `messages=${source.messages}`,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.sessions.latest?.contextBudget?.cacheLayout) {
    const layout = status.sessions.latest.contextBudget.cacheLayout;
    const totalChars = layout.stablePrefixChars + layout.volatileTailChars;
    const stableRatio = totalChars > 0
      ? `${Math.round((layout.stablePrefixChars / totalChars) * 100)}%`
      : "unknown";
    lines.push("");
    lines.push("Cache layout:");
    lines.push([
      `stable=${layout.stablePrefixFingerprint}`,
      `stableChars=${layout.stablePrefixChars}`,
      `tail=${layout.volatileTailFingerprint}`,
      `tailChars=${layout.volatileTailChars}`,
      `stableRatio=${stableRatio}`,
    ].join("  "));
    lines.push([
      `stableSources=${layout.stableSources.join(",") || "none"}`,
      `volatileSources=${layout.volatileSources.join(",") || "none"}`,
    ].join("  "));
  }

  if (status.modelRequests.recent.length > 0) {
    lines.push("");
    lines.push("Recent model requests:");
    for (const request of status.modelRequests.recent.slice(0, 5)) {
      lines.push([
        request.model ?? "unknown-model",
        request.provider ? `provider=${request.provider}` : undefined,
        request.durationMs === undefined ? undefined : `duration=${request.durationMs}ms`,
        request.usage ? formatUsage(request.usage) : "usage=unavailable",
      ].filter(Boolean).join("  "));
    }
  }

  if (status.toolOutputs.recent.length > 0) {
    lines.push("");
    lines.push("Recent tool output:");
    for (const output of status.toolOutputs.recent.slice(0, 5)) {
      lines.push([
        output.toolName ?? "tool",
        output.kind ? `kind=${output.kind}` : undefined,
        output.mode ? `mode=${output.mode}` : undefined,
        output.rawTokens === undefined ? undefined : `raw=${output.rawTokens}`,
        output.projectedTokens === undefined ? undefined : `projected=${output.projectedTokens}`,
        output.savedTokens === undefined ? undefined : `saved=${output.savedTokens}`,
        output.savingsRatio === undefined ? undefined : `savedRatio=${Math.round(output.savingsRatio * 100)}%`,
        output.truncated ? "recoverable=yes" : undefined,
        output.degraded ? "degraded=yes" : undefined,
        output.outputPath ? `full=${truncateCliValue(output.outputPath, 80)}` : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.scene.executions.length > 0) {
    lines.push("");
    lines.push("Delegated task scene:");
    for (const execution of status.scene.executions) {
      lines.push([
        execution.id,
        execution.kind,
        execution.status,
        `risk=${execution.risk}`,
        `summary=${truncateCliValue(execution.summary, 80)}`,
        `next=${execution.nextAction}`,
      ].filter(Boolean).join("  "));
      if (execution.lastOutput) {
        lines.push(`  lastOutput=${execution.lastOutput}`);
      }
    }
  }

  if (status.executions.recent.length > 0) {
    lines.push("");
    lines.push("Recent executions:");
    for (const execution of status.executions.recent.slice(0, 5)) {
      lines.push([
        execution.id,
        execution.kind,
        execution.status,
        execution.actorName ? `actor=${execution.actorName}` : undefined,
        execution.summary ? truncateCliValue(execution.summary, 80) : undefined,
        execution.assignment?.expectedOutput ? `expected=${truncateCliValue(execution.assignment.expectedOutput, 60)}` : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.memory.assets.length > 0) {
    lines.push("");
    lines.push("Memory:");
    for (const memory of status.memory.assets.slice(0, 5)) {
      lines.push([
        memory.id,
        memory.kind,
        `bytes=${memory.size}`,
        memory.evidenceRefs.length > 0 ? `evidence=${memory.evidenceRefs.join(",")}` : undefined,
        memory.path,
      ].filter(Boolean).join("  "));
    }
  }

  if (status.skills.needsAttention.length > 0) {
    lines.push("");
    lines.push("Skills needing attention:");
    for (const skill of status.skills.needsAttention) {
      lines.push([
        skill.name,
        skill.path,
        `resources=${skill.resources}`,
        `dependencies=${skill.dependencies}`,
        skill.issues.length > 0 ? `issues=${skill.issues.join("; ")}` : undefined,
      ].filter(Boolean).join("  "));
    }
  }

  return `${lines.join("\n")}\n`;
}

function readSessionLine(status: RuntimeStatus): string {
  if (!status.sessions.latest) {
    return "none";
  }
  return `${status.sessions.latest.id} (${status.sessions.latest.messageCount} message(s))`;
}

function readBackgroundSceneLine(status: RuntimeStatus): string {
  const { active, blocked, nextAction } = status.scene.background;
  if (active === 0) {
    return nextAction;
  }
  return `${active} active${blocked > 0 ? `, ${blocked} need attention` : ""}; ${nextAction}`;
}

function readMemorySceneLine(status: RuntimeStatus): string {
  const session = status.scene.memory.latestSessionMemory ? "session memory ready" : "session memory not saved yet";
  const assets = status.scene.memory.assets === 0
    ? "no reviewable memory files"
    : `${status.scene.memory.assets} reviewable memory file(s)`;
  return `${session}; ${assets}; ${status.scene.memory.nextAction}`;
}

function readSkillsSceneLine(status: RuntimeStatus): string {
  return `${status.scene.skills.ready}/${status.scene.skills.total} ready; ${status.scene.skills.nextAction}`;
}

function readContextBudgetLine(status: RuntimeStatus): string {
  const budget = status.sessions.latest?.contextBudget;
  if (!budget) {
    return "none";
  }
  const percent = Math.round(budget.usageRatio * 100);
  return [
    `${budget.estimatedChars}/${budget.limitChars} chars`,
    `${percent}%`,
    budget.compressed ? `compressed=${budget.compressionMode}` : "compressed=no",
    `reason=${budget.compressionReason}`,
  ].join("  ");
}

function readModelCacheLine(status: RuntimeStatus): string {
  const latest = status.modelRequests.recent[0];
  if (!latest) {
    return "none";
  }
  if (!latest.usage) {
    return latest.usageAvailable ? "usage unavailable" : "usage unavailable from provider";
  }
  const cacheTokens = latest.usage.cacheHitTokens ?? latest.usage.cacheReadTokens;
  const missTokens = latest.usage.cacheMissTokens;
  const rate = latest.usage.cacheHitRate === undefined
    ? undefined
    : `${Math.round(latest.usage.cacheHitRate * 100)}%`;
  return [
    cacheTokens === undefined ? "cached=unknown" : `cached=${cacheTokens}`,
    missTokens === undefined ? undefined : `miss=${missTokens}`,
    rate ? `hit=${rate}` : undefined,
  ].filter(Boolean).join("  ");
}

function formatUsage(usage: NonNullable<RuntimeStatus["modelRequests"]["recent"][number]["usage"]>): string {
  return [
    usage.inputTokens === undefined ? undefined : `input=${usage.inputTokens}`,
    usage.outputTokens === undefined ? undefined : `output=${usage.outputTokens}`,
    usage.reasoningTokens === undefined ? undefined : `reasoning=${usage.reasoningTokens}`,
    usage.cacheHitTokens === undefined ? undefined : `cacheHit=${usage.cacheHitTokens}`,
    usage.cacheReadTokens === undefined ? undefined : `cacheRead=${usage.cacheReadTokens}`,
    usage.cacheCreationTokens === undefined ? undefined : `cacheWrite=${usage.cacheCreationTokens}`,
    usage.cacheMissTokens === undefined ? undefined : `cacheMiss=${usage.cacheMissTokens}`,
    usage.cacheHitRate === undefined ? undefined : `hit=${Math.round(usage.cacheHitRate * 100)}%`,
  ].filter(Boolean).join(" ");
}
