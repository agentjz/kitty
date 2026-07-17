import chalk from "chalk";

import packageJson from "../../package.json";
import { translate, type KittyLocale } from "../i18n/index.js";
import { renderKittyProductBanner } from "../runtime-ui/banner.js";
import { writeStdoutLine } from "../utils/stdio.js";

export interface RemoteServiceIntroOptions {
  product: "telegram" | "weixin";
  locale: KittyLocale;
  stateDir: string;
  allowedUserCount: number;
  transport: string;
}

export function formatRemoteServiceIntro(
  options: RemoteServiceIntroOptions & { compact?: boolean; columns?: number },
): string {
  const title = `kitty ${options.product}`;
  const facts = [
    `${translate(options.locale, "remote.service.state")}: ${options.stateDir}`,
    `${translate(options.locale, "remote.service.allowed")}: ${options.allowedUserCount}`,
    `${translate(options.locale, "remote.service.transport")}: ${options.transport}`,
  ];
  if (options.compact) {
    return `${title} v${packageJson.version} | ${translate(options.locale, "remote.service.online")} | ${facts.join(" | ")}`;
  }
  return [
    `v${packageJson.version}`,
    "",
    renderKittyProductBanner(options.product, options.columns),
    "",
    translate(options.locale, "remote.service.online"),
    ...facts,
  ].join("\n");
}

export function writeRemoteServiceIntro(options: RemoteServiceIntroOptions): void {
  const compact = !process.stdout.isTTY;
  const output = formatRemoteServiceIntro({ ...options, compact, columns: process.stdout.columns });
  writeStdoutLine(compact ? output : chalk.bold(chalk.greenBright(output)));
}
