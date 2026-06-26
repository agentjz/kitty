import { BackgroundExecutionStore } from "../execution/background.js";
import { formatBackgroundExecution } from "../cli/commands/background.js";
import { formatConfigPreflightReport, inspectConfigPreflight } from "../config/preflight.js";
import { formatMemoryListForCli, readMemoryListForCli } from "../cli/commands/memory.js";
import { formatRuntimeStatusText } from "../cli/commands/runtimeStatusPresenter.js";
import { formatSessionEventsForCli, readSessionEventsForCli } from "../cli/commands/events.js";
import { getAppPaths } from "../config/paths.js";
import { resolveProjectRoots } from "../context/repoRoots.js";
import { resetProjectRuntime } from "../project/reset.js";
import { buildRuntimeStatus } from "../runtime/status.js";
import { summarizeExecution } from "../runtime/executionSummary.js";
import type { SessionStoreLike } from "../session/index.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { formatLocalCommandHelp, isLocalCommand, normalizeLocalCommand } from "./localCommandDefinitions.js";
import type { ShellOutputPort } from "./shell.js";

export interface LocalCommandContext {
  cwd: string;
  stateRootDir?: string;
  session: SessionRecord;
  config: RuntimeConfig;
  sessionStore?: SessionStoreLike;
}

export type LocalCommandResult = "continue" | "handled" | "quit";

export function isExplicitExitCommand(input: string): boolean {
  return isLocalCommand(input, "exit");
}

export async function handleLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
): Promise<LocalCommandResult> {
  if (!input.trim()) {
    return "handled";
  }

  const command = normalizeLocalCommand(input);

  if (command === "exit") {
    return "quit";
  }

  if (command === "reset") {
    await resetProjectRuntime({
      cwd: context.cwd,
      config: context.config,
      currentSessionId: context.session.id,
    });
    output.warn("Project runtime reset. Session closed.");
    return "quit";
  }

  if (command === "help") {
    output.plain(formatLocalCommandHelp());
    return "handled";
  }

  if (command === "session") {
    output.info(`Current session: ${context.session.id}`);
    return "handled";
  }

  if (command === "config") {
    output.info(`model=${context.config.model} baseUrl=${context.config.baseUrl}`);
    return "handled";
  }

  if (command === "status") {
    output.plain(formatRuntimeStatusText(await buildRuntimeStatus(await resolveLocalStateRootDir(context))).trimEnd());
    return "handled";
  }

  if (command === "background") {
    output.plain(await formatBackgroundExecutionsForLocalCommand(context));
    return "handled";
  }

  if (command === "memory") {
    output.plain(formatMemoryListForCli(await readMemoryListForCli(await resolveLocalStateRootDir(context))));
    return "handled";
  }

  if (command === "skills") {
    output.plain(formatSkillsForLocalCommand(await buildRuntimeStatus(await resolveLocalStateRootDir(context))));
    return "handled";
  }

  if (command === "events") {
    const stateRootDir = await resolveLocalStateRootDir(context);
    output.plain(formatSessionEventsForCli(await readSessionEventsForCli({
      cwd: stateRootDir,
      paths: getAppPaths(stateRootDir),
      sessionId: context.session.id,
      limit: 20,
    })));
    return "handled";
  }

  if (command === "doctor") {
    output.plain(formatConfigPreflightReport(await inspectConfigPreflight(context.cwd)).join("\n"));
    return "handled";
  }

  if (command === "sessions") {
    output.plain(await formatSessionsForLocalCommand(context));
    return "handled";
  }

  if (command === "copy") {
    output.plain(formatSessionTranscript(context.session));
    return "handled";
  }

  if (command === "export") {
    output.plain(JSON.stringify(context.session, null, 2));
    return "handled";
  }

  if (command === "clear") {
    output.info("Current prompt cleared.");
    return "handled";
  }

  return "continue";
}

async function formatBackgroundExecutionsForLocalCommand(context: LocalCommandContext): Promise<string> {
  const stateRootDir = await resolveLocalStateRootDir(context);
  const store = new BackgroundExecutionStore(stateRootDir);
  const executions = store
    .listAll()
    .map(summarizeExecution)
    .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  if (executions.length === 0) {
    return "No background executions recorded.";
  }
  return executions.map(formatBackgroundExecution).join("\n");
}

async function resolveLocalStateRootDir(context: Pick<LocalCommandContext, "cwd" | "stateRootDir">): Promise<string> {
  return context.stateRootDir ?? (await resolveProjectRoots(context.cwd)).stateRootDir;
}

function formatSkillsForLocalCommand(status: Awaited<ReturnType<typeof buildRuntimeStatus>>): string {
  if (status.skills.total === 0) {
    return status.scene.skills.nextAction;
  }
  return [
    `skills: ${status.skills.ready}/${status.skills.total} ready`,
    ...status.skills.needsAttention.map((skill) =>
      `${skill.name}  status=${skill.status}  issues=${skill.issues.join("; ") || "none"}`),
  ].join("\n");
}

async function formatSessionsForLocalCommand(context: LocalCommandContext): Promise<string> {
  const sessions = await (context.sessionStore?.list(10) ?? []);
  if (sessions.length === 0) {
    return "No saved sessions yet.";
  }
  return sessions.map((session) => [
    session.id === context.session.id ? "*" : " ",
    session.id,
    session.updatedAt,
    session.title ?? "(untitled)",
    `messages=${session.messageCount}`,
  ].join("  ")).join("\n");
}

function formatSessionTranscript(session: SessionRecord): string {
  if (session.messages.length === 0) {
    return "Current session has no messages yet.";
  }
  return session.messages.map((message) => `${message.role}: ${message.content}`).join("\n\n");
}
