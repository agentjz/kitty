import type { WeixinRuntimeConfig } from "../config/hosts.js";
import type { WeixinClientLike } from "./client.js";
import type { WeixinSyncBufStore } from "./state.js";
import type { WeixinPollingBatch, WeixinPollingSourceLike } from "./types.js";

export class WeixinPollingSource implements WeixinPollingSourceLike {
  private syncBuf: string | null | undefined;
  private timeoutMs: number;
  constructor(private readonly client: WeixinClientLike, private readonly store: WeixinSyncBufStore, config: WeixinRuntimeConfig) { this.timeoutMs = config.pollingTimeoutMs; }
  async poll(signal?: AbortSignal): Promise<WeixinPollingBatch> {
    if (this.syncBuf === undefined) this.syncBuf = await this.store.load();
    const batch = await this.client.getUpdates(this.syncBuf, this.timeoutMs, signal);
    if (batch.longPollingTimeoutMs && batch.longPollingTimeoutMs > 0) this.timeoutMs = Math.trunc(batch.longPollingTimeoutMs);
    return batch;
  }
  stage(syncBuf: string | null): void { if (syncBuf) this.syncBuf = syncBuf; }
  async commit(syncBuf: string | null): Promise<void> { if (syncBuf) { await this.store.save(syncBuf); this.syncBuf = syncBuf; } }
}
