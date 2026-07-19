import { KITTY_ENV } from "./envKeys.js";
import { EXTENSION_DEFINITIONS } from "../extensions/definitions.js";
import { INITIAL_TELEGRAM_CONFIG, INITIAL_WEIXIN_CONFIG } from "./hosts.js";
import { INITIAL_PROJECT_DOC_MAX_BYTES } from "./projectDocs.js";
import { getInitialRuntimeConfig } from "./initialConfig.js";
import { getDefaultProviderPreset, getProviderPresetBaseUrl, PROVIDER_PRESETS } from "./providerPresets.js";
import type { ProviderPreset } from "./providerPresets.js";

export function buildProjectEnvTemplate(example: boolean): string {
  const initialConfig = getInitialRuntimeConfig();
  const providerKey = example ? "replace-with-your-provider-key" : "";
  const defaultPreset = getDefaultProviderPreset();

  return [
    "# Kitty 环境配置",
    "# 当前项目的本地凭证、Provider 预设、远程渠道与运行参数。",
    "",
    ...formatCommonEnvSections({ initialConfig, defaultPreset, providerKey, example }),
  ].join("\n");
}

function formatCommonEnvSections(input: {
  initialConfig: ReturnType<typeof getInitialRuntimeConfig>;
  defaultPreset: ReturnType<typeof getDefaultProviderPreset>;
  providerKey: string;
  example: boolean;
}): string[] {
  const inactiveProviderKey = input.example ? "replace-with-your-provider-key" : "";
  const activeTelegramToken = "";
  const activeTelegramAllowedUsers = "";
  return [
    "# 智能体配置",
    "# 界面语言：zh-CN、en、ja、ko",
    `${KITTY_ENV.locale}=${input.initialConfig.locale}`,
    `${KITTY_ENV.profile}=${input.initialConfig.profile}`,
    "",
    "# 当前语言模型 Provider",
    "# 切换 Provider 时，需要同时替换对应的 KITTY_API_KEY。",
    ...formatProviderPreset(input.defaultPreset, {
      apiKey: input.providerKey,
      commented: false,
    }),
    "",
    "# 其他 Provider 预设",
    ...PROVIDER_PRESETS
      .filter((preset) => preset !== input.defaultPreset)
      .flatMap((preset) => [
        ...formatProviderPreset(preset, {
          apiKey: inactiveProviderKey,
          commented: true,
        }),
        "",
      ]),
    "# 微信 iLink 私聊",
    `${KITTY_ENV.weixinBaseUrl}=${INITIAL_WEIXIN_CONFIG.baseUrl}`,
    `${KITTY_ENV.weixinCdnBaseUrl}=${INITIAL_WEIXIN_CONFIG.cdnBaseUrl}`,
    `${KITTY_ENV.weixinAllowedUserIds}=`,
    `${KITTY_ENV.weixinPollingTimeoutMs}=${INITIAL_WEIXIN_CONFIG.pollingTimeoutMs}`,
    `${KITTY_ENV.weixinPollingRetryBackoffMs}=${INITIAL_WEIXIN_CONFIG.pollingRetryBackoffMs}`,
    `${KITTY_ENV.weixinMessageChunkBytes}=${INITIAL_WEIXIN_CONFIG.messageChunkBytes}`,
    `${KITTY_ENV.weixinTypingIntervalMs}=${INITIAL_WEIXIN_CONFIG.typingIntervalMs}`,
    `${KITTY_ENV.weixinQrTimeoutMs}=${INITIAL_WEIXIN_CONFIG.qrTimeoutMs}`,
    `${KITTY_ENV.weixinRouteTag}=${INITIAL_WEIXIN_CONFIG.routeTag}`,
    "",
    "# Telegram 私聊",
    `${KITTY_ENV.telegramToken}=${activeTelegramToken}`,
    `${KITTY_ENV.telegramAllowedUserIds}=${activeTelegramAllowedUsers}`,
    `${KITTY_ENV.telegramApiBaseUrl}=${INITIAL_TELEGRAM_CONFIG.apiBaseUrl}`,
    `${KITTY_ENV.telegramProxyUrl}=${INITIAL_TELEGRAM_CONFIG.proxyUrl}`,
    `${KITTY_ENV.telegramPollingTimeoutSeconds}=${INITIAL_TELEGRAM_CONFIG.polling.timeoutSeconds}`,
    `${KITTY_ENV.telegramPollingLimit}=${INITIAL_TELEGRAM_CONFIG.polling.limit}`,
    `${KITTY_ENV.telegramPollingRetryBackoffMs}=${INITIAL_TELEGRAM_CONFIG.polling.retryBackoffMs}`,
    `${KITTY_ENV.telegramMessageChunkChars}=${INITIAL_TELEGRAM_CONFIG.messageChunkChars}`,
    `${KITTY_ENV.telegramTypingIntervalMs}=${INITIAL_TELEGRAM_CONFIG.typingIntervalMs}`,
    `${KITTY_ENV.telegramDeliveryMaxRetries}=${INITIAL_TELEGRAM_CONFIG.delivery.maxRetries}`,
    `${KITTY_ENV.telegramDeliveryBaseDelayMs}=${INITIAL_TELEGRAM_CONFIG.delivery.baseDelayMs}`,
    `${KITTY_ENV.telegramDeliveryMaxDelayMs}=${INITIAL_TELEGRAM_CONFIG.delivery.maxDelayMs}`,
    "",
    "# Extension 开关",
    ...EXTENSION_DEFINITIONS.map((definition) =>
      `${definition.envKey}=${String(input.initialConfig.extensions[definition.id])}`),
    "",
    "# 运行参数",
    `${KITTY_ENV.maxOutputTokens}=${input.initialConfig.maxOutputTokens}`,
    `${KITTY_ENV.contextWindowMessages}=${input.initialConfig.contextWindowMessages}`,
    `${KITTY_ENV.maxContextChars}=${input.initialConfig.maxContextChars}`,
    `${KITTY_ENV.contextSummaryChars}=${input.initialConfig.contextSummaryChars}`,
    `${KITTY_ENV.maxReadBytes}=${input.initialConfig.maxReadBytes}`,
    `${KITTY_ENV.projectDocMaxBytes}=${INITIAL_PROJECT_DOC_MAX_BYTES}`,
    `${KITTY_ENV.commandStallTimeoutMs}=${input.initialConfig.commandStallTimeoutMs}`,
    `${KITTY_ENV.showReasoning}=${String(input.initialConfig.showReasoning)}`,
    "",
    "# 图片与视频生成",
    `${KITTY_ENV.mediaProvider}=${input.initialConfig.media.provider}`,
    `${KITTY_ENV.mediaBaseUrl}=${input.initialConfig.media.baseUrl}`,
    `${KITTY_ENV.mediaApiKey}=${input.example ? "replace-with-your-agnes-key" : ""}`,
    `${KITTY_ENV.mediaImageModel}=${input.initialConfig.media.imageModel}`,
    `${KITTY_ENV.mediaVideoModel}=${input.initialConfig.media.videoModel}`,
    `${KITTY_ENV.mediaRequestTimeoutMs}=${input.initialConfig.media.requestTimeoutMs}`,
    `${KITTY_ENV.mediaPollIntervalMs}=${input.initialConfig.media.pollIntervalMs}`,
    "",
  ];
}

function formatProviderPreset(
  preset: ProviderPreset,
  options: {
    apiKey: string;
    commented: boolean;
  },
): string[] {
  const prefix = options.commented ? "# " : "";
  return [
    `# Provider 预设：${preset.label}`,
    preset.reasoningEffort
      ? "# 思考：enabled/disabled；推理强度：high 常规，max 更充分但通常更慢。"
      : "# 思考：enabled/disabled；此模型不使用推理强度，留空即可。",
    `${prefix}${KITTY_ENV.provider}=${preset.provider}`,
    `${prefix}${KITTY_ENV.apiKey}=${options.apiKey}`,
    `${prefix}${KITTY_ENV.baseUrl}=${getProviderPresetBaseUrl(preset)}`,
    `${prefix}${KITTY_ENV.model}=${preset.model}`,
    `${prefix}${KITTY_ENV.thinking}=${preset.thinking ?? ""}`,
    `${prefix}${KITTY_ENV.reasoningEffort}=${preset.reasoningEffort ?? ""}`,
  ];
}
