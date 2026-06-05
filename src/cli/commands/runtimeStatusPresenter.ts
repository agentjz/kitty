import type { RuntimeStatus } from "../../runtime/status.js";
import { truncateCliValue } from "../cliValues.js";

export function formatRuntimeStatusText(status: RuntimeStatus): string {
  const lines: string[] = [];

  lines.push(`Project: ${status.rootDir}`);
  lines.push(`State: ${status.stateDir}`);
  lines.push("");
  lines.push("Now:");
  lines.push(`- Objective: ${readObjective(status)}`);
  lines.push(`- Session: ${readSessionLine(status)}`);
  lines.push(`- Memory: ${status.memory.sessions.length > 0 ? `${status.memory.sessions.length} asset(s)` : "none"}`);
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

  if (status.memory.sessions.length > 0) {
    lines.push("");
    lines.push("Memory:");
    for (const memory of status.memory.sessions.slice(0, 5)) {
      lines.push([
        memory.sessionId,
        `bytes=${memory.size}`,
        memory.path,
      ].join("  "));
    }
  }

  if (status.specs.active.length > 0) {
    lines.push("");
    lines.push("Active specs:");
    for (const spec of status.specs.active) {
      lines.push([spec.id, spec.stage, spec.title].join("  "));
    }
  }

  return `${lines.join("\n")}\n`;
}

function readObjective(status: RuntimeStatus): string {
  const objective = status.taskLifecycle?.objective ?? status.sessions.latest?.objective;
  return objective ? truncateCliValue(objective, 100) : "none";
}

function readSessionLine(status: RuntimeStatus): string {
  if (!status.sessions.latest) {
    return "none";
  }
  return `${status.sessions.latest.id} (${status.sessions.latest.messageCount} message(s))`;
}
