import type { Command } from "commander";

import { loadLatestSession } from "../../host/session.js";
import { SessionEventStore, type SessionEventRecord } from "../../session/events.js";
import type { CliOverrides, RuntimeConfig } from "../../types.js";
import { ui } from "../../utils/console.js";
import { writeStdoutLine } from "../../utils/stdio.js";
import { createSessionStore } from "./sessionHelpers.js";

export function registerEventsCommand(
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
    .command("events")
    .description("Show session event facts for the latest or selected session.")
    .argument("[sessionId]", "Session id. Defaults to the latest session.")
    .option("-n, --limit <count>", "Number of events to show", (value) => Number.parseInt(value, 10), 20)
    .option("--json", "Print structured JSON.")
    .action(async (sessionId: string | undefined, commandOptions: { json?: boolean; limit?: number }) => {
      const runtime = await options.resolveRuntime(options.getCliOverrides());
      const result = await readSessionEventsForCli({
        cwd: runtime.cwd,
        paths: runtime.paths,
        sessionId,
        limit: commandOptions.limit ?? 20,
      });

      if (!result.sessionId) {
        if (commandOptions.json) {
          writeStdoutLine(JSON.stringify({ sessionId: null, events: [] }, null, 2));
          return;
        }
        ui.info("No saved sessions yet.");
        return;
      }

      if (commandOptions.json) {
        writeStdoutLine(JSON.stringify(result, null, 2));
        return;
      }

      if (result.events.length === 0) {
        ui.info(`No events recorded for session ${result.sessionId}.`);
        return;
      }

      for (const event of result.events) {
        writeStdoutLine(formatSessionEvent(event));
      }
    });
}

export async function readSessionEventsForCli(input: {
  cwd: string;
  paths: RuntimeConfig["paths"];
  sessionId?: string;
  limit: number;
}): Promise<{ sessionId: string | null; events: SessionEventRecord[] }> {
  const sessionStore = await createSessionStore(input.paths.sessionsDir);
  const session = input.sessionId ? await sessionStore.load(input.sessionId) : await loadLatestSession(sessionStore);
  if (!session) {
    return {
      sessionId: null,
      events: [],
    };
  }

  return {
    sessionId: session.id,
    events: await new SessionEventStore(input.paths.eventsDir).list(session.id, input.limit),
  };
}

function formatSessionEvent(event: SessionEventRecord): string {
  const parts = [
    event.createdAt,
    event.type,
    event.host ? `host=${event.host}` : undefined,
    event.message ? `message=${formatInline(event.message)}` : undefined,
    event.details ? `details=${formatInline(JSON.stringify(event.details))}` : undefined,
  ];
  return parts.filter(Boolean).join("  ");
}

function formatInline(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}
