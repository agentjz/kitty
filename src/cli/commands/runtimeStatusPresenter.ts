import type { RuntimeStatus } from "../../runtime/status.js";
import { truncateCliValue } from "../cliValues.js";

export function formatRuntimeStatusText(status: RuntimeStatus): string {
  const lines: string[] = [];

  lines.push(`Project: ${status.rootDir}`);
  lines.push(`State: ${status.stateDir}`);
  lines.push("");
  lines.push("Current workspace:");
  lines.push(`- Focus: ${readFocus(status)}`);
  lines.push(`- Session: ${readSessionLine(status)}`);
  lines.push(`- Next: ${readNextStep(status)}`);
  lines.push(`- Blocked: ${readBlockedLine(status)}`);
  lines.push(`- Context budget: ${readContextBudgetLine(status)}`);
  lines.push(`- Workset: ${status.sessions.latest?.workset ? `${status.sessions.latest.workset.total} file(s)` : "none"}`);
  lines.push(`- Memory: ${status.memory.assets.length > 0 ? `${status.memory.assets.length} asset(s)` : "none"}`);
  lines.push(`- Skills: ${status.skills.ready}/${status.skills.total} ready`);
  lines.push(`- Model cache: ${readModelCacheLine(status)}`);
  lines.push(`- Project map: ${status.projectMap ? "ready" : "missing"}`);
  lines.push(`- Executions: ${status.executions.active.length} active / ${status.executions.total} total`);
  lines.push(`- Wake signals: ${status.wakeSignals.recent.length}`);

  if (status.taskLifecycle) {
    lines.push("");
    lines.push("Task lifecycle:");
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
    lines.push("Project map:");
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
    lines.push("");
    lines.push("Cache layout:");
    lines.push([
      `stable=${layout.stablePrefixFingerprint}`,
      `stableChars=${layout.stablePrefixChars}`,
      `tail=${layout.volatileTailFingerprint}`,
      `tailChars=${layout.volatileTailChars}`,
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

  if (status.executions.active.length > 0) {
    lines.push("");
    lines.push("Active executions:");
    for (const execution of status.executions.active) {
      lines.push([
        execution.id,
        execution.kind,
        execution.status,
        execution.actorName ? `actor=${execution.actorName}` : undefined,
        execution.waitPolicy ? `wait=${execution.waitPolicy}` : undefined,
        execution.health ? `health=${execution.health.state}` : undefined,
        execution.deadlineAt ? `deadline=${execution.deadlineAt}` : undefined,
        execution.assignment?.objective ? `objective=${truncateCliValue(execution.assignment.objective, 60)}` : undefined,
      ].filter(Boolean).join("  "));
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

function readFocus(status: RuntimeStatus): string {
  const focus = status.sessions.latest?.focus;
  return focus ? truncateCliValue(focus, 100) : "none";
}

function readSessionLine(status: RuntimeStatus): string {
  if (!status.sessions.latest) {
    return "none";
  }
  return `${status.sessions.latest.id} (${status.sessions.latest.messageCount} message(s))`;
}

function readNextStep(status: RuntimeStatus): string {
  if (status.executions.active.length > 0) {
    return "Wait for active execution results or inspect them with status/tools.";
  }
  if (!status.sessions.latest) {
    return "Start a session with `kitty` or run a prompt.";
  }
  return "Continue from the current session focus.";
}

function readBlockedLine(status: RuntimeStatus): string {
  const unhealthy = status.executions.active.find((execution) =>
    execution.health?.state === "stale" || execution.health?.state === "deadline_passed",
  );
  if (unhealthy) {
    return `${unhealthy.kind} ${unhealthy.id}: ${unhealthy.health?.message}`;
  }
  return "no";
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
    return "usage unavailable";
  }
  const cacheTokens = latest.usage.cacheHitTokens ?? latest.usage.cacheReadTokens;
  const rate = latest.usage.cacheHitRate === undefined
    ? undefined
    : `${Math.round(latest.usage.cacheHitRate * 100)}%`;
  return [
    cacheTokens === undefined ? "cached=unknown" : `cached=${cacheTokens}`,
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
