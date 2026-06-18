import chalk from "chalk";

import { formatLocalCommandHelpLine, listIntroLocalCommands } from "../../interaction/localCommandDefinitions.js";
import type { ShellOutputPort } from "../../interaction/shell.js";
import type { SessionRecord } from "../../types.js";
import { renderKittyBanner } from "../banner.js";

export function writeCliInteractiveIntro(options: {
  cwd: string;
  session: Pick<SessionRecord, "id">;
  output: ShellOutputPort;
  toolsLabel?: string;
}): void {
  options.output.plain(chalk.bold(chalk.greenBright(renderKittyBanner())));
  options.output.dim(`session: ${options.session.id}`);
  options.output.dim(`cwd: ${options.cwd}`);
  if (options.toolsLabel) {
    options.output.dim(`Tools: ${options.toolsLabel}`);
  }
  options.output.dim("Commands:");
  for (const command of listIntroLocalCommands()) {
    options.output.dim(formatLocalCommandHelpLine(command.id));
  }
  options.output.dim("");
}
