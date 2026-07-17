import crypto from "node:crypto";
import type { RemoteDeliveryEntry } from "../remote/deliveryQueue.js";
import { RemoteDeliveryDeferredError, RemoteDeliveryQueue } from "../remote/deliveryQueue.js";
import type { WeixinClientLike } from "./client.js";
import type { WeixinContextTokenStore } from "./state.js";

export interface WeixinDeliveryEntry { id: string; kind: "text" | "file"; peerKey: string; userId: string; text?: string; filePath?: string; fileName?: string; caption?: string; createdAt: number; }

export class WeixinDeliveryQueue {
  private readonly queue: RemoteDeliveryQueue;
  constructor(options: { rootDir: string; client: WeixinClientLike; contextTokens: WeixinContextTokenStore; onDelivered?: (entry: WeixinDeliveryEntry) => void; onDeliveryFailed?: (entry: WeixinDeliveryEntry, error: unknown) => void }) {
    this.queue = new RemoteDeliveryQueue({
      rootDir: options.rootDir,
      host: "weixin",
      deliver: async (remote) => {
        const entry = fromRemote(remote);
        const contextToken = await options.contextTokens.getUsableToken(entry.peerKey);
        if (!contextToken) throw new RemoteDeliveryDeferredError(`No current iLink context token for ${entry.peerKey}.`);
        if (entry.kind === "file") {
          await options.client.sendFile({ userId: entry.userId, contextToken, filePath: entry.filePath!, fileName: entry.fileName, caption: entry.caption });
        } else {
          await options.client.sendText({ userId: entry.userId, contextToken, text: entry.text!, clientId: `kitty-weixin:${crypto.randomUUID()}` });
        }
      },
      onDelivered: (entry) => options.onDelivered?.(fromRemote(entry)),
      onDeliveryFailed: (entry, error) => options.onDeliveryFailed?.(fromRemote(entry), error),
    });
  }
  async enqueueText(input: { peerKey: string; userId: string; text: string }): Promise<WeixinDeliveryEntry> { return fromRemote(await this.queue.enqueue({ recipientKey: input.peerKey, kind: "text", payload: input })); }
  async enqueueFile(input: { peerKey: string; userId: string; filePath: string; fileName?: string; caption?: string }): Promise<WeixinDeliveryEntry> { return fromRemote(await this.queue.enqueue({ recipientKey: input.peerKey, kind: "file", payload: input })); }
  async flushDue(): Promise<void> { await this.queue.flushDue(); }
  async listPending(): Promise<WeixinDeliveryEntry[]> { return (await this.queue.listPending()).map(fromRemote); }
}

function fromRemote(entry: RemoteDeliveryEntry): WeixinDeliveryEntry {
  return { id: entry.id, kind: entry.kind, peerKey: entry.recipientKey, userId: String(entry.payload.userId ?? ""), text: typeof entry.payload.text === "string" ? entry.payload.text : undefined, filePath: typeof entry.payload.filePath === "string" ? entry.payload.filePath : undefined, fileName: typeof entry.payload.fileName === "string" ? entry.payload.fileName : undefined, caption: typeof entry.payload.caption === "string" ? entry.payload.caption : undefined, createdAt: entry.createdAt };
}
