import fs from "node:fs/promises";
import QRCode from "qrcode";

import { resolveRuntimeConfig } from "../config/runtime.js";
import { createTelegramService } from "../telegram/cli.js";
import { acquireTelegramProcessLock } from "../telegram/processLock.js";
import { createWeixinService } from "../weixin/cli.js";
import { OpenILinkWeixinClient } from "../weixin/client.js";
import { WeixinCredentialStore, WeixinSyncBufStore } from "../weixin/state.js";
import { acquireWeixinProcessLock } from "../weixin/processLock.js";
import { WebEventHub } from "./events.js";

type ChannelName = "weixin" | "telegram";
type ChannelStatus = "stopped" | "starting" | "running" | "stopping" | "failed";

interface ManagedChannel {
  status: ChannelStatus;
  error?: string;
  controller?: AbortController;
  service?: { run(signal?: AbortSignal): Promise<void>; stop?(): void; waitForIdle?(): Promise<void> };
  task?: Promise<void>;
  lock?: { signal?: AbortSignal; release(): Promise<void> };
}

export class WebChannelManager {
  private readonly channels: Record<ChannelName, ManagedChannel> = {
    weixin: { status: "stopped" },
    telegram: { status: "stopped" },
  };
  private loginState: { status: "idle" | "waiting" | "scanned" | "connected" | "failed"; qr?: string; qrImage?: string; error?: string } = { status: "idle" };

  constructor(private readonly cwd: string, private readonly events: WebEventHub) {}

  status() {
    return {
      weixin: { status: this.channels.weixin.status, error: this.channels.weixin.error },
      telegram: { status: this.channels.telegram.status, error: this.channels.telegram.error },
      weixinLogin: this.loginState,
    };
  }

  async refreshStatus() {
    if (this.loginState.status === "idle") {
      const config = await resolveRuntimeConfig({ cwd: this.cwd });
      if (await new WeixinCredentialStore(config.weixin.credentialsFile).load()) {
        this.loginState = { status: "connected" };
      }
    }
    return this.status();
  }

  async start(name: ChannelName): Promise<void> {
    const item = this.channels[name];
    if (item.status === "running" || item.status === "starting") return;
    item.status = "starting";
    item.error = undefined;
    this.emit();
    try {
      const config = await resolveRuntimeConfig({ cwd: this.cwd });
      if (name === "telegram") {
        if (!config.telegram.token) throw new Error("Telegram token is not configured.");
        if (config.telegram.allowedUserIds.length === 0) throw new Error("Telegram allowed user list is empty.");
      } else {
        if (config.weixin.allowedUserIds.length === 0) throw new Error("Weixin allowed user list is empty.");
      }
      const service = name === "telegram"
        ? await createTelegramService({ cwd: this.cwd, config })
        : await createWeixinService({ cwd: this.cwd, config });
      const lock = name === "telegram"
        ? await acquireTelegramProcessLock({ stateDir: config.telegram.stateDir })
        : await acquireWeixinProcessLock({ stateDir: config.weixin.stateDir });
      const controller = new AbortController();
      item.service = service;
      item.controller = controller;
      item.lock = lock;
      item.status = "running";
      const signal = lock.signal ? AbortSignal.any([controller.signal, lock.signal]) : controller.signal;
      item.task = service.run(signal).then(
        () => { item.status = "stopped"; },
        (error) => { item.status = "failed"; item.error = error instanceof Error ? error.message : String(error); },
      ).finally(async () => {
        await lock.release().catch(() => undefined);
        item.lock = undefined;
        this.emit();
      });
      this.emit();
    } catch (error) {
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
      this.emit();
      throw error;
    }
  }

  async stop(name: ChannelName): Promise<void> {
    const item = this.channels[name];
    if (item.status === "stopped") return;
    item.status = "stopping";
    this.emit();
    item.service?.stop?.();
    item.controller?.abort(new Error(`${name} stopped from Web console.`));
    await Promise.race([
      item.task?.catch(() => undefined) ?? Promise.resolve(),
      new Promise((resolve) => setTimeout(resolve, 5_000)),
    ]);
    item.status = "stopped";
    item.service = undefined;
    item.controller = undefined;
    item.task = undefined;
    item.lock = undefined;
    this.emit();
  }

  async stopAll(): Promise<void> {
    await Promise.allSettled([this.stop("weixin"), this.stop("telegram")]);
  }

  async probeTelegram(): Promise<Record<string, unknown>> {
    const config = await resolveRuntimeConfig({ cwd: this.cwd });
    if (!config.telegram.token) throw new Error("Telegram token is not configured.");
    const response = await fetch(`${config.telegram.apiBaseUrl.replace(/\/+$/u, "")}/bot${config.telegram.token}/getMe`, {
      signal: AbortSignal.timeout(15_000),
    });
    const payload = await response.json() as { ok?: boolean; result?: { id?: number; username?: string }; description?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.description ?? `Telegram returned ${response.status}.`);
    return { ok: true, id: payload.result?.id, username: payload.result?.username };
  }

  async loginWeixin(): Promise<void> {
    if (this.loginState.status === "waiting" || this.loginState.status === "scanned") return;
    const config = await resolveRuntimeConfig({ cwd: this.cwd });
    this.loginState = { status: "waiting" };
    this.emit();
    const client = new OpenILinkWeixinClient({
      baseUrl: config.weixin.baseUrl,
      cdnBaseUrl: config.weixin.cdnBaseUrl,
      routeTag: config.weixin.routeTag,
    });
    void client.loginWithQr({
      timeoutMs: config.weixin.qrTimeoutMs,
      onQrCode: (qr) => {
        this.loginState = { status: "waiting", qr };
        this.emit();
        void QRCode.toDataURL(qr, { width: 260, margin: 1 }).then((qrImage) => {
          if (this.loginState.qr !== qr) return;
          this.loginState = { ...this.loginState, qrImage };
          this.emit();
        }, (error) => {
          if (this.loginState.qr !== qr) return;
          this.loginState = { status: "failed", error: error instanceof Error ? error.message : String(error) };
          this.emit();
        });
      },
      onScanned: () => { this.loginState = { ...this.loginState, status: "scanned" }; this.emit(); },
    }).then(async (state) => {
      await new WeixinCredentialStore(config.weixin.credentialsFile).save(state);
      this.loginState = { status: "connected" };
      this.emit();
    }, (error) => {
      this.loginState = { status: "failed", error: error instanceof Error ? error.message : String(error) };
      this.emit();
    });
  }

  async logoutWeixin(): Promise<void> {
    const config = await resolveRuntimeConfig({ cwd: this.cwd });
    await this.stop("weixin");
    await new WeixinCredentialStore(config.weixin.credentialsFile).clear();
    await new WeixinSyncBufStore(config.weixin.syncBufFile).clear();
    await fs.rm(config.weixin.contextTokenFile, { force: true });
    this.loginState = { status: "idle" };
    this.emit();
  }

  private emit(): void {
    this.events.publish("channels", this.status());
  }
}
