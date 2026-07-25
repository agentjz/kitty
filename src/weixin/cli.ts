import fs from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";

import type { CliOverrides, RuntimeConfig } from "../types.js";
import { getErrorMessage } from "../agent/errors.js";
import { translate, type KittyLocale } from "../i18n/index.js";
import { runRemoteServiceWithLock } from "../remote/serviceLifecycle.js";
import { writeRemoteServiceIntro } from "../shell/remoteServiceIntro.js";
import { OpenILinkWeixinClient } from "./client.js";
import { WeixinAttachmentStore } from "./attachments.js";
import { WeixinDeliveryQueue } from "./deliveryQueue.js";
import { createConsoleWeixinLogger } from "./logger.js";
import { WeixinService } from "./service.js";
import { WeixinContextTokenStore, WeixinCredentialStore, WeixinSessionMapStore, WeixinSyncBufStore } from "./state.js";

export async function createWeixinService(options: { cwd: string; config: RuntimeConfig }) {
  const { SessionStore } = await import("../session/index.js");
  const credentials = await new WeixinCredentialStore(options.config.weixin.credentialsFile).load();
  if (!credentials) throw new Error(translate(options.config.locale, "weixin.notLoggedIn"));
  const client = new OpenILinkWeixinClient({ token: credentials.token, baseUrl: credentials.baseUrl || options.config.weixin.baseUrl, cdnBaseUrl: credentials.cdnBaseUrl || options.config.weixin.cdnBaseUrl, routeTag: options.config.weixin.routeTag });
  const contexts = new WeixinContextTokenStore(options.config.weixin.contextTokenFile);
  const logger = createConsoleWeixinLogger();
  const rootDir = path.dirname(options.config.paths.dataDir);
  const delivery = new WeixinDeliveryQueue({ rootDir, client, contextTokens: contexts, onDelivered: (entry) => logger.info("delivery sent", { kind: entry.kind, userId: entry.userId }), onDeliveryFailed: (entry, error) => logger.error("delivery failed", { kind: entry.kind, userId: entry.userId, error: getErrorMessage(error) }) });
  return new WeixinService({ cwd: options.cwd, config: options.config, client, boundUserId: credentials.userId, sessionStore: new SessionStore(options.config.paths.sessionsDir), sessionMap: new WeixinSessionMapStore(options.config.weixin.sessionMapFile), syncBuf: new WeixinSyncBufStore(options.config.weixin.syncBufFile), contextTokens: contexts, attachments: new WeixinAttachmentStore(options.config.weixin.attachmentStoreFile), delivery, logger });
}

export function registerWeixinCommands(program: Command, dependencies: {
  locale: KittyLocale;
  getCliOverrides: () => CliOverrides;
  resolveRuntime: (overrides: CliOverrides) => Promise<{ cwd: string; config: RuntimeConfig }>;
  createWeixinLoginClient?: (options: { baseUrl: string; cdnBaseUrl: string; routeTag: string }) => Pick<OpenILinkWeixinClient, "loginWithQr">;
  createWeixinService?: (options: { cwd: string; config: RuntimeConfig }) => Promise<{ run(signal?: AbortSignal): Promise<void>; stop?(): void }>;
  acquireProcessLock?: (options: { stateDir: string }) => Promise<{ signal?: AbortSignal; release(): Promise<void> }>;
}): void {
  const command = program.command("weixin").description(translate(dependencies.locale, "cli.command.weixin"));
  command.command("login").description(translate(dependencies.locale, "cli.command.weixinLogin")).action(async () => {
    const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
    const client = dependencies.createWeixinLoginClient?.({ baseUrl: runtime.config.weixin.baseUrl, cdnBaseUrl: runtime.config.weixin.cdnBaseUrl, routeTag: runtime.config.weixin.routeTag }) ?? new OpenILinkWeixinClient({ baseUrl: runtime.config.weixin.baseUrl, cdnBaseUrl: runtime.config.weixin.cdnBaseUrl, routeTag: runtime.config.weixin.routeTag });
    const state = await client.loginWithQr({ timeoutMs: runtime.config.weixin.qrTimeoutMs, onQrCode: (value) => console.log(translate(runtime.config.locale, "weixin.qrCode", { value })), onScanned: () => console.log(translate(runtime.config.locale, "weixin.scanned")) });
    await new WeixinCredentialStore(runtime.config.weixin.credentialsFile).save(state);
    console.log(translate(runtime.config.locale, "weixin.loginSucceeded"));
  });
  command.command("serve").description(translate(dependencies.locale, "cli.command.weixinServe")).action(async () => {
    const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
    const acquire = dependencies.acquireProcessLock ?? (await import("./processLock.js")).acquireWeixinProcessLock;
    const lock = await acquire({ stateDir: runtime.config.weixin.stateDir });
    const factory = dependencies.createWeixinService ?? createWeixinService;
    await runRemoteServiceWithLock({
      lock,
      createService: () => factory({ cwd: runtime.cwd, config: runtime.config }),
      onStarted: () => writeRemoteServiceIntro({
        product: "weixin",
        locale: runtime.config.locale,
        stateDir: runtime.config.weixin.stateDir,
        allowedUserCount: 1,
        transport: "iLink",
      }),
    });
  });
  command.command("logout").description(translate(dependencies.locale, "cli.command.weixinLogout")).action(async () => {
    const runtime = await dependencies.resolveRuntime(dependencies.getCliOverrides());
    await new WeixinCredentialStore(runtime.config.weixin.credentialsFile).clear();
    await new WeixinSyncBufStore(runtime.config.weixin.syncBufFile).clear();
    await fs.rm(runtime.config.weixin.contextTokenFile, { force: true });
    console.log(translate(runtime.config.locale, "weixin.loggedOut"));
  });
}
