import fs from "node:fs/promises";
import path from "node:path";
import type { ClientConfig } from "@openilink/openilink-sdk-node";

import type { WeixinLoginState } from "./state.js";
import type { WeixinPollingBatch, WeixinRawMessage } from "./types.js";

export interface WeixinClientLike {
  loginWithQr(options: { timeoutMs: number; signal?: AbortSignal; onQrCode?: (content: string) => void; onScanned?: () => void }): Promise<WeixinLoginState>;
  getUpdates(syncBuf?: string | null, timeoutMs?: number, signal?: AbortSignal): Promise<WeixinPollingBatch>;
  getTypingConfig(userId: string, contextToken: string): Promise<string | null>;
  sendTyping(userId: string, ticket: string): Promise<void>;
  sendText(input: { userId: string; contextToken: string; text: string; clientId: string }): Promise<void>;
  sendFile(input: { userId: string; contextToken: string; filePath: string; fileName?: string; caption?: string }): Promise<void>;
  downloadMedia(media: { encrypt_query_param?: string; aes_key?: string; full_url?: string } | undefined): Promise<Uint8Array>;
  downloadVoice(voice: { media?: { encrypt_query_param?: string; aes_key?: string; full_url?: string }; sample_rate?: number } | undefined): Promise<Uint8Array>;
}

export class OpenILinkWeixinClient implements WeixinClientLike {
  private clientPromise: Promise<RuntimeClient> | null = null;
  constructor(private readonly options: { token?: string; baseUrl: string; cdnBaseUrl: string; routeTag?: string }) {}
  async loginWithQr(options: { timeoutMs: number; signal?: AbortSignal; onQrCode?: (content: string) => void; onScanned?: () => void }): Promise<WeixinLoginState> {
    const client = await abortable(this.client(), options.signal);
    const result = await abortable(client.loginWithQr({ on_qrcode: options.onQrCode, on_scanned: options.onScanned }, options.timeoutMs), options.signal);
    return createWeixinLoginState(result, client);
  }
  async getUpdates(syncBuf?: string | null, timeoutMs?: number, signal?: AbortSignal): Promise<WeixinPollingBatch> {
    const client = await this.client();
    const response = await abortable(client.getUpdates(syncBuf || undefined, timeoutMs), signal);
    return { messages: (response.msgs ?? []) as WeixinRawMessage[], syncBuf: response.sync_buf || null, longPollingTimeoutMs: response.longpolling_timeout_ms };
  }
  async getTypingConfig(userId: string, contextToken: string): Promise<string | null> { return (await (await this.client()).getConfig(userId, contextToken)).typing_ticket || null; }
  async sendTyping(userId: string, ticket: string): Promise<void> { await (await this.client()).sendTyping(userId, ticket, 1); }
  async sendText(input: { userId: string; contextToken: string; text: string; clientId: string }): Promise<void> {
    await (await this.client()).sendMessage({ from_user_id: "", to_user_id: input.userId, client_id: input.clientId, message_type: 2, message_state: 2, context_token: input.contextToken, item_list: [{ type: 1, text_item: { text: input.text } }] });
  }
  async sendFile(input: { userId: string; contextToken: string; filePath: string; fileName?: string; caption?: string }): Promise<void> {
    await (await this.client()).sendMediaFile(input.userId, input.contextToken, await fs.readFile(input.filePath), input.fileName || path.basename(input.filePath), input.caption);
  }
  async downloadMedia(media: Parameters<WeixinClientLike["downloadMedia"]>[0]): Promise<Uint8Array> { return (await this.client()).downloadMedia(media); }
  async downloadVoice(voice: Parameters<WeixinClientLike["downloadVoice"]>[0]): Promise<Uint8Array> { return (await this.client()).downloadVoice(voice); }
  private async client(): Promise<RuntimeClient> { this.clientPromise ??= this.create(); return this.clientPromise; }
  private async create(): Promise<RuntimeClient> {
    const sdk = await import("@openilink/openilink-sdk-node") as unknown as { Client: new (token: string, config: ClientConfig) => RuntimeClient };
    return new sdk.Client(this.options.token ?? "", {
      base_url: this.options.baseUrl,
      cdn_base_url: this.options.cdnBaseUrl,
      route_tag: this.options.routeTag || undefined,
      silk_decoder: async (data, rate) => (await import("silk-wasm")).decode(data, rate).then((x) => x.data),
    });
  }
}

export function createWeixinLoginState(result: WeixinQrLoginResult, client: { baseUrl: string; cdnBaseUrl: string }): WeixinLoginState {
  if (!result.connected || !result.bot_token) throw new Error(result.message || "Weixin iLink QR login failed.");
  const userId = result.user_id?.trim();
  if (!userId) throw new Error("Weixin iLink QR login did not return a user ID.");
  const now = new Date().toISOString();
  return { token: result.bot_token, baseUrl: result.base_url || client.baseUrl, cdnBaseUrl: client.cdnBaseUrl, botId: result.bot_id, userId, connectedAt: now, updatedAt: now };
}

export interface WeixinQrLoginResult {
  connected: boolean;
  bot_token?: string;
  bot_id?: string;
  base_url?: string;
  user_id?: string;
  message: string;
}

interface RuntimeClient {
  baseUrl: string; cdnBaseUrl: string;
  loginWithQr(callbacks: { on_qrcode?: (url: string) => void; on_scanned?: () => void }, timeout: number): Promise<WeixinQrLoginResult>;
  getUpdates(sync?: string, timeout?: number): Promise<{ msgs?: unknown[]; sync_buf?: string; longpolling_timeout_ms?: number }>;
  getConfig(userId: string, token: string): Promise<{ typing_ticket?: string }>;
  sendTyping(userId: string, ticket: string, status: number): Promise<void>;
  sendMessage(message: Record<string, unknown>): Promise<void>;
  sendMediaFile(userId: string, token: string, data: Uint8Array, name: string, caption?: string): Promise<void>;
  downloadMedia(media: Parameters<WeixinClientLike["downloadMedia"]>[0]): Promise<Uint8Array>;
  downloadVoice(voice: Parameters<WeixinClientLike["downloadVoice"]>[0]): Promise<Uint8Array>;
}

async function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  signal.throwIfAborted();
  return Promise.race([promise, new Promise<T>((_, reject) => signal.addEventListener("abort", () => reject(signal.reason), { once: true }))]);
}
