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
        writeStdoutLine(formatSessionEventForCli(event));
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

export function formatSessionEventsForCli(result: { sessionId: string | null; events: SessionEventRecord[] }): string {
  if (!result.sessionId) {
    return "No saved sessions yet.";
  }
  if (result.events.length === 0) {
    return `No events recorded for session ${result.sessionId}.`;
  }
  return result.events.map(formatSessionEventForCli).join("\n");
}

export function formatSessionEventForCli(event: SessionEventRecord): string {
  if (isToolEvent(event)) {
    return formatToolEventForCli(event);
  }
  const parts = [
    event.createdAt,
    event.type,
    event.host ? `host=${event.host}` : undefined,
    event.message ? `message=${formatInline(event.message)}` : undefined,
    event.details ? `details=${formatInline(JSON.stringify(event.details))}` : undefined,
  ];
  return parts.filter(Boolean).join("  ");
}

function formatToolEventForCli(event: SessionEventRecord): string {
  const details = event.details ?? {};
  const toolName = readString(details.toolName);
  const toolCallId = readString(details.toolCallId);
  const durationMs = readNumber(details.durationMs);
  const changedPathCount = readNumber(details.changedPathCount);
  const error = readString(details.error);
  const parts = [
    event.createdAt,
    event.type,
    toolName ? `tool=${toolName}` : undefined,
    toolCallId ? `call=${toolCallId}` : undefined,
    durationMs === undefined ? undefined : `duration=${durationMs}ms`,
    changedPathCount === undefined ? undefined : `changed=${changedPathCount}`,
    error ? `error=${formatInline(error)}` : undefined,
    event.host ? `host=${event.host}` : undefined,
    event.message ? `message=${formatInline(event.message)}` : undefined,
  ];
  return parts.filter(Boolean).join("  ");
}

function isToolEvent(event: SessionEventRecord): boolean {
  return event.type === "tool.started" || event.type === "tool.completed" || event.type === "tool.failed";
}

function formatInline(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized.length > 120 ? `${normalized.slice(0, 117)}...` : normalized;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
