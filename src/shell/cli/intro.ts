import chalk from "chalk";

import { formatLocalCommandHelpLine, listIntroLocalCommands } from "../../interaction/localCommandDefinitions.js";
import type { ShellOutputPort } from "../../interaction/shell.js";
import type { SessionRecord } from "../../types.js";
import { renderKittyBanner } from "../banner.js";
import { translate, type KittyLocale } from "../../i18n/index.js";

export function writeCliInteractiveIntro(options: {
  cwd: string;
  session: Pick<SessionRecord, "id">;
  output: ShellOutputPort;
  locale: KittyLocale;
  toolsLabel?: string;
}): void {
  options.output.plain(chalk.bold(chalk.greenBright(renderKittyBanner())));
  options.output.dim(`${translate(options.locale, "cli.intro.session")}: ${options.session.id}`);
  options.output.dim(`${translate(options.locale, "cli.intro.cwd")}: ${options.cwd}`);
  if (options.toolsLabel) {
    options.output.dim(`${translate(options.locale, "cli.intro.tools")}: ${options.toolsLabel}`);
  }
  options.output.dim(`${translate(options.locale, "cli.intro.commands")}:`);
  for (const command of listIntroLocalCommands(options.locale)) {
    options.output.dim(formatLocalCommandHelpLine(command.id, options.locale));
  }
  options.output.dim("");
}
