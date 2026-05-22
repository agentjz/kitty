import chalk from "chalk";
import figlet from "figlet";

import { formatLocalCommandHelpLine } from "../../interaction/localCommandDefinitions.js";
import type { ShellOutputPort } from "../../interaction/shell.js";
import type { SessionRecord } from "../../types.js";

const KITTY_WORDMARK_FONT = "ANSI Shadow";

function renderKittyBanner(): string {
  return figlet
    .textSync("kitty agent", {
      font: KITTY_WORDMARK_FONT,
      horizontalLayout: "default",
      verticalLayout: "default",
      width: 120,
      whitespaceBreak: false,
    })
    .trimEnd();
}

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
  options.output.dim(formatLocalCommandHelpLine("help"));
  options.output.dim(formatLocalCommandHelpLine("multiline"));
  options.output.dim(formatLocalCommandHelpLine("reset"));
  options.output.dim(formatLocalCommandHelpLine("exit"));
  options.output.dim("::end        Submit multiline input");
  options.output.dim("::cancel     Cancel multiline input\n");
}
