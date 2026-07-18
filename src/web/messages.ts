import { KITTY_BASE_ENV } from "../config/envKeys.js";
import type { ExtensionId } from "../extensions/definitions.js";
import { SUPPORTED_LOCALES, translate, type KittyLocale, type MessageKey } from "../i18n/index.js";

type RuntimeControl = "text" | "number" | "url" | "select";

interface RuntimeFieldDefinition {
  envKey: (typeof KITTY_BASE_ENV)[keyof typeof KITTY_BASE_ENV];
  labelKey: MessageKey;
  control: RuntimeControl;
  option?: "locale" | "thinking" | "reasoning" | "boolean";
}

const RUNTIME_FIELDS = [
  { envKey: KITTY_BASE_ENV.locale, labelKey: "web.runtime.locale", control: "select", option: "locale" },
  { envKey: KITTY_BASE_ENV.profile, labelKey: "web.runtime.profile", control: "text" },
  { envKey: KITTY_BASE_ENV.thinking, labelKey: "web.runtime.thinking", control: "select", option: "thinking" },
  { envKey: KITTY_BASE_ENV.reasoningEffort, labelKey: "web.runtime.reasoningEffort", control: "select", option: "reasoning" },
  { envKey: KITTY_BASE_ENV.maxOutputTokens, labelKey: "web.runtime.maxOutputTokens", control: "number" },
  { envKey: KITTY_BASE_ENV.contextWindowMessages, labelKey: "web.runtime.contextWindowMessages", control: "number" },
  { envKey: KITTY_BASE_ENV.maxContextChars, labelKey: "web.runtime.maxContextChars", control: "number" },
  { envKey: KITTY_BASE_ENV.contextSummaryChars, labelKey: "web.runtime.contextSummaryChars", control: "number" },
  { envKey: KITTY_BASE_ENV.maxReadBytes, labelKey: "web.runtime.maxReadBytes", control: "number" },
  { envKey: KITTY_BASE_ENV.projectDocMaxBytes, labelKey: "web.runtime.projectDocMaxBytes", control: "number" },
  { envKey: KITTY_BASE_ENV.commandStallTimeoutMs, labelKey: "web.runtime.commandStallTimeoutMs", control: "number" },
  { envKey: KITTY_BASE_ENV.showReasoning, labelKey: "web.runtime.showReasoning", control: "select", option: "boolean" },
  { envKey: KITTY_BASE_ENV.telegramApiBaseUrl, labelKey: "web.runtime.telegramApiBaseUrl", control: "url" },
  { envKey: KITTY_BASE_ENV.telegramProxyUrl, labelKey: "web.runtime.telegramProxyUrl", control: "url" },
  { envKey: KITTY_BASE_ENV.telegramPollingTimeoutSeconds, labelKey: "web.runtime.telegramPollingTimeoutSeconds", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramPollingLimit, labelKey: "web.runtime.telegramPollingLimit", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramPollingRetryBackoffMs, labelKey: "web.runtime.telegramPollingRetryBackoffMs", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramMessageChunkChars, labelKey: "web.runtime.telegramMessageChunkChars", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramTypingIntervalMs, labelKey: "web.runtime.telegramTypingIntervalMs", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramDeliveryMaxRetries, labelKey: "web.runtime.telegramDeliveryMaxRetries", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramDeliveryBaseDelayMs, labelKey: "web.runtime.telegramDeliveryBaseDelayMs", control: "number" },
  { envKey: KITTY_BASE_ENV.telegramDeliveryMaxDelayMs, labelKey: "web.runtime.telegramDeliveryMaxDelayMs", control: "number" },
  { envKey: KITTY_BASE_ENV.weixinBaseUrl, labelKey: "web.runtime.weixinBaseUrl", control: "url" },
  { envKey: KITTY_BASE_ENV.weixinCdnBaseUrl, labelKey: "web.runtime.weixinCdnBaseUrl", control: "url" },
  { envKey: KITTY_BASE_ENV.weixinPollingTimeoutMs, labelKey: "web.runtime.weixinPollingTimeoutMs", control: "number" },
  { envKey: KITTY_BASE_ENV.weixinPollingRetryBackoffMs, labelKey: "web.runtime.weixinPollingRetryBackoffMs", control: "number" },
  { envKey: KITTY_BASE_ENV.weixinMessageChunkBytes, labelKey: "web.runtime.weixinMessageChunkBytes", control: "number" },
  { envKey: KITTY_BASE_ENV.weixinTypingIntervalMs, labelKey: "web.runtime.weixinTypingIntervalMs", control: "number" },
  { envKey: KITTY_BASE_ENV.weixinQrTimeoutMs, labelKey: "web.runtime.weixinQrTimeoutMs", control: "number" },
  { envKey: KITTY_BASE_ENV.weixinRouteTag, labelKey: "web.runtime.weixinRouteTag", control: "text" },
] as const satisfies readonly RuntimeFieldDefinition[];

const EXTENSION_SUMMARY_KEYS = {
  todo: "web.extension.todo",
  scheduler: "web.extension.scheduler",
  worktree: "web.extension.worktree",
  network: "web.extension.network",
  background: "web.extension.background",
  documents: "web.extension.documents",
  skills: "web.extension.skills",
} as const satisfies Record<ExtensionId, MessageKey>;

export function buildWebMessages(locale: KittyLocale) {
  const t = (key: MessageKey) => translate(locale, key);
  return {
    pageTitle: t("web.pageTitle"),
    welcome: t("tui.authorTip"),
    common: {
      back: t("web.common.back"), save: t("web.common.save"), sendTest: t("web.common.sendTest"),
      start: t("web.common.start"), stop: t("web.common.stop"),
      github: t("web.common.github"),
      notConfigured: t("web.common.notConfigured"), custom: t("web.common.custom"), requestFailed: t("web.common.requestFailed"),
      connectionSuccess: t("web.common.connectionSuccess"), serviceState: t("web.common.serviceState"), models: t("web.common.models"),
      skills: t("web.common.skills"), eventUpdated: t("web.common.eventUpdated"), eventDisconnected: t("web.common.eventDisconnected"),
    },
    status: {
      stopped: t("web.status.stopped"), starting: t("web.status.starting"), running: t("web.status.running"),
      stopping: t("web.status.stopping"), failed: t("web.status.failed"), unknown: t("web.status.unknown"),
    },
    login: {
      waiting: t("web.login.waiting"), scanned: t("web.login.scanned"), connected: t("web.login.connected"), failed: t("web.login.failed"),
    },
    workflow: {
      config: t("web.workflow.config"), weixin: t("web.workflow.weixin"), telegram: t("web.workflow.telegram"), skills: t("web.workflow.skills"),
      loadingConfig: t("web.workflow.loadingConfig"), loadingService: t("web.workflow.loadingService"), loadingSkills: t("web.workflow.loadingSkills"),
      configNote: t("web.workflow.configNote"), weixinNote: t("web.workflow.weixinNote"),
      telegramNote: t("web.workflow.telegramNote"), skillsNote: t("web.workflow.skillsNote"),
      guide: t("web.workflow.guide"),
    },
    config: {
      description: t("web.config.description"), currentTitle: t("web.config.currentTitle"), providerTitle: t("web.config.providerTitle"),
      providerHint: t("web.config.providerHint"), validationTitle: t("web.config.validationTitle"), validationHint: t("web.config.validationHint"),
      settingsTitle: t("web.config.settingsTitle"), settingsHint: t("web.config.settingsHint"), extensionsTitle: t("web.config.extensionsTitle"),
      runtimeTitle: t("web.config.runtimeTitle"), preset: t("web.config.preset"), provider: t("web.config.provider"), model: t("web.config.model"),
      baseUrl: t("web.config.baseUrl"), apiKey: t("web.config.apiKey"), apiKeyHint: t("web.config.apiKeyHint"),
      currentLoaded: t("web.config.currentLoaded"), saved: t("web.config.saved"), probeSuccess: t("web.config.probeSuccess"),
    },
    weixin: {
      description: t("web.weixin.description"), allowedTitle: t("web.weixin.allowedTitle"), userId: t("web.weixin.userId"),
      usersPlaceholder: t("web.weixin.usersPlaceholder"), saved: t("web.weixin.saved"), loginTitle: t("web.weixin.loginTitle"),
      loginHint: t("web.weixin.loginHint"), generateQr: t("web.weixin.generateQr"), logout: t("web.weixin.logout"),
      startTitle: t("web.weixin.startTitle"), startHint: t("web.weixin.startHint"), streamEmpty: t("web.weixin.streamEmpty"),
      waitingLogin: t("web.weixin.waitingLogin"), credentialsCleared: t("web.weixin.credentialsCleared"), qrGenerating: t("web.weixin.qrGenerating"),
      connected: t("web.weixin.connected"), qrAlt: t("web.weixin.qrAlt"),
    },
    telegram: {
      description: t("web.telegram.description"), botTitle: t("web.telegram.botTitle"), token: t("web.telegram.token"),
      tokenHint: t("web.telegram.tokenHint"), users: t("web.telegram.users"), usersPlaceholder: t("web.telegram.usersPlaceholder"),
      saved: t("web.telegram.saved"), verifyTitle: t("web.telegram.verifyTitle"), verifyHint: t("web.telegram.verifyHint"),
      startTitle: t("web.telegram.startTitle"), startHint: t("web.telegram.startHint"), streamEmpty: t("web.telegram.streamEmpty"),
      probeSuccess: t("web.telegram.probeSuccess"),
    },
    skills: {
      description: t("web.skills.description"), empty: t("web.skills.empty"), source: t("web.skills.source"),
    },
    stream: {
      inbound: t("web.stream.inbound"), status: t("web.stream.status"), reasoning: t("web.stream.reasoning"),
      assistant: t("web.stream.assistant"), final: t("web.stream.final"), toolCall: t("web.stream.toolCall"),
      toolProgress: t("web.stream.toolProgress"), toolResult: t("web.stream.toolResult"), toolError: t("web.stream.toolError"), error: t("web.stream.error"),
    },
    runtime: {
      fields: RUNTIME_FIELDS.map((field) => ({
        envKey: field.envKey,
        label: t(field.labelKey),
        control: field.control,
        options: buildOptions(locale, "option" in field ? field.option : undefined),
      })),
    },
    extensionSummaries: Object.fromEntries(
      Object.entries(EXTENSION_SUMMARY_KEYS).map(([id, key]) => [id, t(key)]),
    ) as Record<ExtensionId, string>,
  };
}

function buildOptions(locale: KittyLocale, option: RuntimeFieldDefinition["option"]) {
  if (!option) return undefined;
  if (option === "locale") {
    return SUPPORTED_LOCALES.map((value) => ({ value, label: translate(locale, `web.locale.${value}` as MessageKey) }));
  }
  const values = option === "thinking"
    ? ["enabled", "disabled"]
    : option === "reasoning"
      ? ["xhigh", "high", "medium", "low", "minimal"]
      : ["true", "false"];
  return values.map((value) => ({ value, label: translate(locale, `web.option.${value}` as MessageKey) }));
}
