import path from "node:path";

import type { Command } from "commander";

import { getErrorMessage } from "../agent/errors.js";
import type { CliOverrides, RuntimeConfig } from "../types.js";
import { translate, type KittyLocale } from "../i18n/index.js";
import { runRemoteServiceWithLock } from "../remote/serviceLifecycle.js";
import { writeRemoteServiceIntro } from "../shell/remoteServiceIntro.js";

export async function createTelegramService(options: {
  cwd: string;
  config: RuntimeConfig;
}) {
  const [
    { SessionStore },
    { FetchTelegramBotApiClient },
    { TelegramDeliveryQueue },
    { createConsoleTelegramLogger },
    { FileTelegramOffsetStore },
    { applyTelegramProxyEnvironment },
    { FileTelegramSessionMapStore },
    { TelegramService },
  ] = await Promise.all([
    import("../session/index.js"),
    import("./botApiClient.js"),
    import("./deliveryQueue.js"),
    import("./logger.js"),
    import("./offsetStore.js"),
    import("./proxy.js"),
    import("./sessionMapStore.js"),
    import("./service.js"),
  ]);

  const logger = createConsoleTelegramLogger();
  applyTelegramProxyEnvironment(options.config.telegram.proxyUrl);
  const bot = new FetchTelegramBotApiClient({
    token: options.config.telegram.token,
    apiBaseUrl: options.config.telegram.apiBaseUrl,
  });
  const stateDir = options.config.telegram.stateDir;

  return new TelegramService({
    cwd: options.cwd,
    config: options.config,
    bot,
    sessionStore: new SessionStore(options.config.paths.sessionsDir),
    sessionMapStore: new FileTelegramSessionMapStore(path.join(stateDir, "session-map.json")),
    offsetStore: new FileTelegramOffsetStore(path.join(stateDir, "offset.json")),
    deliveryQueue: new TelegramDeliveryQueue({
      rootDir: path.dirname(options.config.paths.dataDir),
      target: bot,
      onDelivered(entry) {
        logger.info("delivery sent", {
          chatId: entry.chatId,
          fileName: entry.kind === "file" ? entry.fileName : undefined,
          detail: entry.kind === "file" ? "type=file" : "type=text",
        });
      },
      onDeliveryFailed(entry, error) {
        logger.error("delivery failed", {
          chatId: entry.chatId,
          fileName: entry.kind === "file" ? entry.fileName : undefined,
          detail: getErrorMessage(error),
        });
      },
    }),
    logger,
  });
}

export function registerTelegramCommands(
  program: Command,
  dependencies: {
    locale: KittyLocale;
    getCliOverrides: () => CliOverrides;
    resolveRuntime: (overrides: CliOverrides) => Promise<{
      cwd: string;
      config: RuntimeConfig;
      paths: RuntimeConfig["paths"];
      overrides: CliOverrides;
    }>;
    createTelegramService?: (options: {
      cwd: string;
      config: RuntimeConfig;
    }) => Promise<{
      run(signal?: AbortSignal): Promise<void>;
      stop?(): void;
    }>;
    acquireProcessLock?: (options: { stateDir: string }) => Promise<{
      leaseName: string;
      signal?: AbortSignal;
      release(): Promise<void>;
    }>;
  },
): void {
  const telegramCommand = program.command("telegram").description(translate(dependencies.locale, "cli.command.telegram"));

  telegramCommand
    .command("serve")
    .description(translate(dependencies.locale, "cli.command.telegramServe"))
    .action(async () => {
      const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
      if (!runtime.config.telegram.token) {
        throw new Error(translate(runtime.config.locale, "telegram.tokenMissing"));
      }

      if (runtime.config.telegram.allowedUserIds.length === 0) {
        throw new Error(translate(runtime.config.locale, "telegram.whitelistEmpty"));
      }

      const acquireProcessLock =
        dependencies.acquireProcessLock ?? (await import("./processLock.js")).acquireTelegramProcessLock;
      const serviceFactory = dependencies.createTelegramService ?? createTelegramService;
      const lock = await acquireProcessLock({
        stateDir: runtime.config.telegram.stateDir,
      });
      await runRemoteServiceWithLock({
        lock,
        createService: () => serviceFactory({ cwd: runtime.cwd, config: runtime.config }),
        onStarted: () => writeRemoteServiceIntro({
          product: "telegram",
          locale: runtime.config.locale,
          stateDir: runtime.config.telegram.stateDir,
          allowedUserCount: runtime.config.telegram.allowedUserIds.length,
          transport: runtime.config.telegram.proxyUrl ? "Bot API / proxy" : "Bot API / direct",
        }),
      });
    });
}
