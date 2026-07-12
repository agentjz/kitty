import chalk from "chalk";

import type { RuntimeUiChannel } from "./events.js";
import { getRuntimeUiChannelIdentity } from "./channelIdentity.js";
import { DEFAULT_LOCALE, translate, type KittyLocale } from "../i18n/index.js";

export type RuntimeUiSemanticTag = "tool" | "result" | "preview" | "content";

export function formatRuntimeUiChannelHeader(
  channel: RuntimeUiChannel,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  return channelHeaderColor(channel)(`[${channelLabel(channel, locale)}]`);
}

export function formatRuntimeUiSemanticTag(
  tag: RuntimeUiSemanticTag,
  state?: "ok" | "failed",
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  const label = translate(locale, `runtime.${tag}`);
  switch (tag) {
    case "tool":
      return chalk.magenta(`[${label}]`);
    case "result":
      return state === "failed" ? chalk.red(`[${label}]`) : `[${label}]`;
    case "preview":
    case "content":
      return `[${label}]`;
  }
}

export function colorRuntimeUiText(channel: RuntimeUiChannel, text: string): string {
  return colorForChannel(channel)(text);
}

export function channelLabel(channel: RuntimeUiChannel, locale: KittyLocale = DEFAULT_LOCALE): string {
  return getRuntimeUiChannelIdentity(channel, locale).label;
}

function colorForChannel(channel: RuntimeUiChannel): (text: string) => string {
  switch (channel) {
    case "system":
      return chalk.gray;
    case "subagent":
      return chalk.cyan;
    case "lead":
      return (text: string) => text;
  }
}

function channelHeaderColor(channel: RuntimeUiChannel): (text: string) => string {
  switch (channel) {
    case "lead":
    case "system":
      return chalk.red.bold;
    case "subagent":
      return chalk.cyan.bold;
  }
}
