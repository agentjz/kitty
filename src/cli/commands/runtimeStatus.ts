import type { Command } from "commander";

import { buildRuntimeStatus } from "../../runtime/status.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { truncateCliValue } from "../cliValues.js";

export function registerRuntimeStatusCommand(
  program: Command,
  options: {
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
  },
): void {
  program
    .command("status")
    .description("Show the current project runtime status.")
    .option("--json", "Print structured JSON.")
    .action(async (commandOptions: { json?: boolean }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const status = await buildRuntimeStatus(runtime.cwd);

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify(status, null, 2));
        return;
      }

      writeStdoutLine(`Project: ${status.rootDir}`);
      writeStdoutLine(`State: ${status.stateDir}`);
      writeStdoutLine("");
      writeStdoutLine(`Sessions: ${status.sessions.total}${status.sessions.latest ? `  latest=${status.sessions.latest.id}` : ""}`);
      writeStdoutLine(`Memory assets: ${status.memory.sessions.length}`);
      writeStdoutLine(`Executions: ${status.executions.total}  active=${status.executions.active.length}`);
      writeStdoutLine(`Team members: ${status.team.members.length}`);
      writeStdoutLine(`Wake signals: ${status.wakeSignals.recent.length}`);
      writeStdoutLine(`Specs: ${status.specs.total}  active=${status.specs.active.length}`);

      if (status.sessions.latest) {
        writeStdoutLine("");
        writeStdoutLine("Latest session:");
        writeStdoutLine([
          status.sessions.latest.id,
          status.sessions.latest.title ?? "(untitled)",
          `messages=${status.sessions.latest.messageCount}`,
          status.sessions.latest.hasMemory ? "memory=yes" : "memory=no",
        ].join("  "));
      }

      if (status.executions.active.length > 0) {
        writeStdoutLine("");
        writeStdoutLine("Active executions:");
        for (const execution of status.executions.active) {
          writeStdoutLine([
            execution.id,
            execution.kind,
            execution.status,
            execution.actorName ? `actor=${execution.actorName}` : undefined,
            execution.waitPolicy ? `wait=${execution.waitPolicy}` : undefined,
            execution.health ? `health=${execution.health.state}` : undefined,
            execution.assignment?.objective ? `objective=${truncateCliValue(execution.assignment.objective, 60)}` : undefined,
          ].filter(Boolean).join("  "));
        }
      }

      if (status.executions.recent.length > 0) {
        writeStdoutLine("");
        writeStdoutLine("Recent executions:");
        for (const execution of status.executions.recent.slice(0, 5)) {
          writeStdoutLine([
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
        writeStdoutLine("");
        writeStdoutLine("Memory:");
        for (const memory of status.memory.sessions.slice(0, 5)) {
          writeStdoutLine([
            memory.sessionId,
            `bytes=${memory.size}`,
            memory.path,
          ].join("  "));
        }
      }

      if (status.team.members.length > 0) {
        writeStdoutLine("");
        writeStdoutLine("Team:");
        for (const member of status.team.members) {
          writeStdoutLine([
            member.name,
            member.role,
            member.status,
            member.executionId ? `execution=${member.executionId}` : undefined,
          ].filter(Boolean).join("  "));
        }
      }

      if (status.specs.active.length > 0) {
        writeStdoutLine("");
        writeStdoutLine("Active specs:");
        for (const spec of status.specs.active) {
          writeStdoutLine([spec.id, spec.stage, spec.title].join("  "));
        }
      }
    });
}
