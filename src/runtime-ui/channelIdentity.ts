import type { RuntimeUiChannel } from "./events.js";
import { DEFAULT_LOCALE, translate, type KittyLocale, type MessageKey } from "../i18n/index.js";

export interface RuntimeUiChannelIdentity {
  channel: RuntimeUiChannel;
  label: string;
}

export type RuntimeUiLineRole = "assistant" | "reasoning";

const CHANNEL_LABEL_KEYS: Record<RuntimeUiChannel, MessageKey> = {
  agent: "runtime.channel.agent",
  system: "runtime.channel.system",
};

export function getRuntimeUiChannelIdentity(
  channel: RuntimeUiChannel,
  locale: KittyLocale = DEFAULT_LOCALE,
): RuntimeUiChannelIdentity {
  return {
    channel,
    label: translate(locale, CHANNEL_LABEL_KEYS[channel]),
  };
}

export function formatRuntimeUiRoleLabel(
  channel: RuntimeUiChannel,
  role: RuntimeUiLineRole,
  locale: KittyLocale = DEFAULT_LOCALE,
): string {
  const identity = getRuntimeUiChannelIdentity(channel, locale);
  if (role === "reasoning") {
    return `${identity.label} ${translate(locale, "runtime.reasoning")}`;
  }
  return identity.label;
}
