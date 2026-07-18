import { buildRuntimeStatus } from "../runtime/status.js";
import { formatRuntimeStatusText } from "../runtime-ui/statusPresenter.js";
import type { SessionStoreLike } from "../session/index.js";
import { exportSessionConversation } from "../session/transcriptExport.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { formatLocalCommandHelp, normalizeLocalCommand, type LocalCommandSurface } from "./localCommandDefinitions.js";
import type { ShellOutputPort } from "./shell.js";
import { translate } from "../i18n/index.js";

export interface LocalCommandContext {
  cwd: string;
  stateRootDir?: string;
  session: SessionRecord;
  config: RuntimeConfig;
  sessionStore?: SessionStoreLike;
}

export type LocalCommandResult = "continue" | "handled" | "quit";

export function isExplicitExitCommand(input: string): boolean {
  return normalizeLocalCommand(input, "tui") === "exit";
}

export async function handleLocalCommand(
  input: string,
  context: LocalCommandContext,
  output: ShellOutputPort,
  surface: LocalCommandSurface = "tui",
): Promise<LocalCommandResult> {
  if (!input.trim()) return "handled";
  const command = normalizeLocalCommand(input, surface);
  if (command === "exit") return "quit";

  if (command === "status") {
    const status = await buildRuntimeStatus(context.stateRootDir ?? context.cwd, context.config.locale, {
      ownerSessionId: context.session.id,
      config: context.config,
    });
    output.plain(formatRuntimeStatusText(status, context.config.locale).trimEnd());
    return "handled";
  }

  if (command === "export") {
    const session = context.sessionStore
      ? await context.sessionStore.load(context.session.id)
      : context.session;
    const result = await exportSessionConversation(context.cwd, session);
    if (result.sectionCount === 0) {
      output.info(translate(context.config.locale, "local.noMessages"));
      return "handled";
    }
    output.info(translate(context.config.locale, "local.conversationExported", { path: result.filePath }));
    return "handled";
  }

  if (command === "help") {
    output.plain(formatLocalCommandHelp(surface, context.config.locale));
    return "handled";
  }
  return "continue";
}
