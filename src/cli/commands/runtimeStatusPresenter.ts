import type { RuntimeStatus } from "../../runtime/status.js";
import { truncateCliValue } from "../cliValues.js";

export function formatRuntimeStatusText(status: RuntimeStatus): string {
  const lines: string[] = [];

  lines.push(`Project: ${status.rootDir}`);
  lines.push(`State: ${status.stateDir}`);
  lines.push("");
  lines.push("Now:");
  lines.push(`- Focus: ${readFocus(status)}`);
  lines.push(`- Session: ${readSessionLine(status)}`);
  lines.push(`- Context budget: ${readContextBudgetLine(status)}`);
  lines.push(`- Memory: ${status.memory.assets.length > 0 ? `${status.memory.assets.length} asset(s)` : "none"}`);
  lines.push(`- Project map: ${status.projectMap ? "ready" : "missing"}`);
  lines.push(`- Executions: ${status.executions.active.length} active / ${status.executions.total} total`);
  lines.push(`- Specs: ${status.specs.active.length} active / ${status.specs.total} total`);
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

  if (status.specs.active.length > 0) {
    lines.push("");
    lines.push("Active specs:");
    for (const spec of status.specs.active) {
      lines.push([
        spec.id,
        spec.stage,
        spec.workflow ? `next=${spec.workflow.nextGate}` : undefined,
        spec.workflow ? `tools=${spec.workflow.writableTools}` : undefined,
        spec.title,
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
