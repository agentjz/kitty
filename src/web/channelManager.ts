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
  generation: number;
  error?: string;
  controller?: AbortController;
  service?: { run(signal?: AbortSignal): Promise<void>; stop?(): void; waitForIdle?(): Promise<void> };
  task?: Promise<void>;
  lock?: { signal?: AbortSignal; release(): Promise<void> };
  transition?: Promise<void>;
  stopTask?: Promise<void>;
}

export interface WebChannelManagerDependencies {
  createWeixinLoginClient?: (input: { baseUrl: string; cdnBaseUrl: string; routeTag: string }) => Pick<OpenILinkWeixinClient, "loginWithQr">;
  createQrImage?: (value: string) => Promise<string>;
}

export class WebChannelManager {
  private readonly channels: Record<ChannelName, ManagedChannel> = {
    weixin: { status: "stopped", generation: 0 },
    telegram: { status: "stopped", generation: 0 },
  };
  private loginState: { status: "idle" | "waiting" | "scanned" | "connected" | "failed"; qr?: string; qrImage?: string; error?: string } = { status: "idle" };
  private loginGeneration = 0;
  private loginController?: AbortController;
  private loginTask?: Promise<void>;
  private closed = false;
  private closeTask?: Promise<void>;

  constructor(
    private readonly cwd: string,
    private readonly events: WebEventHub,
    private readonly dependencies: WebChannelManagerDependencies = {},
  ) {}

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
    if (this.closed) throw new Error("The local console is closing.");
    const item = this.channels[name];
    if (item.status === "running") return;
    if (item.transition) return item.transition;
    if (item.stopTask) await item.stopTask;
    if (item.task) throw new Error(`${name} is still stopping.`);
    const generation = ++item.generation;
    const transition = this.startOwned(name, item, generation);
    item.transition = transition;
    try {
      await transition;
    } finally {
      if (item.transition === transition) item.transition = undefined;
    }
  }

  private async startOwned(name: ChannelName, item: ManagedChannel, generation: number): Promise<void> {
    item.status = "starting";
    item.error = undefined;
    this.emit();
    let lock: ManagedChannel["lock"];
    try {
      const config = await resolveRuntimeConfig({ cwd: this.cwd });
      if (name === "telegram") {
        if (!config.telegram.token) throw new Error("Telegram token is not configured.");
        if (config.telegram.allowedUserIds.length === 0) throw new Error("Telegram allowed user list is empty.");
      } else {
        if (config.weixin.allowedUserIds.length === 0) throw new Error("Weixin allowed user list is empty.");
      }
      lock = name === "telegram"
        ? await acquireTelegramProcessLock({ stateDir: config.telegram.stateDir })
        : await acquireWeixinProcessLock({ stateDir: config.weixin.stateDir });
      const acquiredLock = lock;
      const service = name === "telegram"
        ? await createTelegramService({ cwd: this.cwd, config })
        : await createWeixinService({ cwd: this.cwd, config });
      if (this.closed || generation !== item.generation) {
        service.stop?.();
        await acquiredLock.release();
        return;
      }
      const controller = new AbortController();
      item.service = service;
      item.controller = controller;
      item.lock = acquiredLock;
      item.status = "running";
      const signal = acquiredLock.signal ? AbortSignal.any([controller.signal, acquiredLock.signal]) : controller.signal;
      item.task = service.run(signal).then(
        () => { if (generation === item.generation) item.status = "stopped"; },
        (error) => {
          if (generation !== item.generation) return;
          item.status = controller.signal.aborted ? "stopped" : "failed";
          item.error = controller.signal.aborted ? undefined : error instanceof Error ? error.message : String(error);
        },
      ).finally(async () => {
        await acquiredLock.release().catch(() => undefined);
        if (generation === item.generation) {
          item.lock = undefined;
          item.service = undefined;
          item.controller = undefined;
          item.task = undefined;
        }
        this.emit();
      });
      this.emit();
    } catch (error) {
      await lock?.release().catch(() => undefined);
      item.status = "failed";
      item.error = error instanceof Error ? error.message : String(error);
      this.emit();
      throw error;
    }
  }

  async stop(name: ChannelName): Promise<void> {
    const item = this.channels[name];
    if (item.stopTask) return item.stopTask;
    const task = this.stopOwned(name, item);
    item.stopTask = task;
    try {
      await task;
    } finally {
      if (item.stopTask === task) item.stopTask = undefined;
    }
  }

  private async stopOwned(name: ChannelName, item: ManagedChannel): Promise<void> {
    await item.transition?.catch(() => undefined);
    if (item.status === "stopped" && !item.task) return;
    item.status = "stopping";
    this.emit();
    item.service?.stop?.();
    item.controller?.abort(new Error(`${name} stopped from Web console.`));
    const settled = await waitAtMost(item.task?.catch(() => undefined) ?? Promise.resolve(), 5_000);
    if (!settled && item.task) {
      item.status = "failed";
      item.error = `${name} did not stop within 5000 ms.`;
      this.emit();
      throw new Error(item.error);
    } else {
      item.status = "stopped";
      item.error = undefined;
    }
    this.emit();
  }

  async stopAll(): Promise<void> {
    const results = await Promise.allSettled([this.stop("weixin"), this.stop("telegram")]);
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (errors.length > 0) throw new AggregateError(errors, "Remote channel cleanup was incomplete.");
  }

  close(): Promise<void> {
    this.closeTask ??= this.closeOwned();
    return this.closeTask;
  }

  private async closeOwned(): Promise<void> {
    this.closed = true;
    this.cancelWeixinLogin();
    const results = await Promise.allSettled([this.loginTask, this.stopAll()]);
    const errors = results.flatMap((result) => result.status === "rejected" ? [result.reason] : []);
    if (errors.length > 0) throw new AggregateError(errors, "Web channel manager cleanup was incomplete.");
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
    if (this.closed) throw new Error("The local console is closing.");
    if (this.loginState.status === "waiting" || this.loginState.status === "scanned") return;
    const config = await resolveRuntimeConfig({ cwd: this.cwd });
    const generation = ++this.loginGeneration;
    const controller = new AbortController();
    this.loginController = controller;
    this.loginState = { status: "waiting" };
    this.emit();
    const client = this.dependencies.createWeixinLoginClient?.({
      baseUrl: config.weixin.baseUrl,
      cdnBaseUrl: config.weixin.cdnBaseUrl,
      routeTag: config.weixin.routeTag,
    }) ?? new OpenILinkWeixinClient({
      baseUrl: config.weixin.baseUrl,
      cdnBaseUrl: config.weixin.cdnBaseUrl,
      routeTag: config.weixin.routeTag,
    });
    const task = client.loginWithQr({
      timeoutMs: config.weixin.qrTimeoutMs,
      signal: controller.signal,
      onQrCode: (qr) => {
        if (!this.isCurrentLogin(generation)) return;
        this.loginState = { status: "waiting", qr };
        this.emit();
        const image = this.dependencies.createQrImage?.(qr) ?? QRCode.toDataURL(qr, { width: 260, margin: 1 });
        void image.then((qrImage) => {
          if (!this.isCurrentLogin(generation) || this.loginState.qr !== qr) return;
          this.loginState = { ...this.loginState, qrImage };
          this.emit();
        }, (error) => {
          if (!this.isCurrentLogin(generation) || this.loginState.qr !== qr) return;
          this.loginState = { status: "failed", error: error instanceof Error ? error.message : String(error) };
          this.emit();
        });
      },
      onScanned: () => {
        if (!this.isCurrentLogin(generation)) return;
        this.loginState = { ...this.loginState, status: "scanned" };
        this.emit();
      },
    }).then(async (state) => {
      if (!this.isCurrentLogin(generation)) return;
      await new WeixinCredentialStore(config.weixin.credentialsFile).save(state);
      if (!this.isCurrentLogin(generation)) return;
      this.loginState = { status: "connected" };
      this.emit();
    }, (error) => {
      if (!this.isCurrentLogin(generation)) return;
      this.loginState = { status: "failed", error: error instanceof Error ? error.message : String(error) };
      this.emit();
    }).finally(() => {
      if (this.loginTask === task) this.loginTask = undefined;
      if (this.loginGeneration === generation) this.loginController = undefined;
    });
    this.loginTask = task;
  }

  async logoutWeixin(): Promise<void> {
    this.cancelWeixinLogin();
    await this.loginTask?.catch(() => undefined);
    const config = await resolveRuntimeConfig({ cwd: this.cwd });
    await this.stop("weixin");
    await new WeixinCredentialStore(config.weixin.credentialsFile).clear();
    await new WeixinSyncBufStore(config.weixin.syncBufFile).clear();
    await fs.rm(config.weixin.contextTokenFile, { force: true });
    this.loginState = { status: "idle" };
    this.emit();
  }

  private emit(): void {
    if (this.closed) return;
    this.events.publish("channels", this.status());
  }

  private cancelWeixinLogin(): void {
    this.loginGeneration += 1;
    this.loginController?.abort(new Error("Weixin login was cancelled."));
    this.loginController = undefined;
  }

  private isCurrentLogin(generation: number): boolean {
    return !this.closed && generation === this.loginGeneration;
  }
}

async function waitAtMost(promise: Promise<unknown>, timeoutMs: number): Promise<boolean> {
  let timer: NodeJS.Timeout | undefined;
  let settled = false;
  await Promise.race([
    promise.then(() => { settled = true; }),
    new Promise<void>((resolve) => { timer = setTimeout(resolve, timeoutMs); }),
  ]).finally(() => { if (timer) clearTimeout(timer); });
  return settled;
}
