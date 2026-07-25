import { readJsonFile, writeJsonFileAtomically } from "./storage.js";

export interface WeixinLoginState {
  token: string; baseUrl: string; cdnBaseUrl: string; botId?: string; userId: string; connectedAt: string; updatedAt: string;
}
export class WeixinCredentialStore {
  constructor(private readonly filePath: string) {}
  async load(): Promise<WeixinLoginState | null> {
    const value = await readJsonFile<WeixinLoginState | null>(this.filePath, null);
    const token = String(value?.token ?? "").trim();
    const userId = String(value?.userId ?? "").trim();
    const baseUrl = String(value?.baseUrl ?? "").trim();
    const cdnBaseUrl = String(value?.cdnBaseUrl ?? "").trim();
    const connectedAt = String(value?.connectedAt ?? "").trim();
    const updatedAt = String(value?.updatedAt ?? "").trim();
    return token && userId && baseUrl && cdnBaseUrl && connectedAt && updatedAt
      ? { token, userId, baseUrl, cdnBaseUrl, botId: value?.botId?.trim() || undefined, connectedAt, updatedAt }
      : null;
  }
  async save(value: WeixinLoginState): Promise<void> { await writeJsonFileAtomically(this.filePath, value, { mode: 0o600 }); }
  async clear(): Promise<void> { await writeJsonFileAtomically(this.filePath, null, { mode: 0o600 }); }
}

export class WeixinSyncBufStore {
  constructor(private readonly filePath: string) {}
  async load(): Promise<string | null> { return (await readJsonFile<{ value?: string } | null>(this.filePath, null))?.value ?? null; }
  async save(value: string): Promise<void> { await writeJsonFileAtomically(this.filePath, { value }); }
  async clear(): Promise<void> { await writeJsonFileAtomically(this.filePath, null); }
}

export interface WeixinSessionBinding { peerKey: string; userId: string; sessionId: string; cwd: string; createdAt: string; updatedAt: string; }
export class WeixinSessionMapStore {
  private tail = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async get(peerKey: string): Promise<WeixinSessionBinding | null> { return this.lock(async () => (await this.read()).find((x) => x.peerKey === peerKey) ?? null); }
  async set(value: WeixinSessionBinding): Promise<void> { await this.lock(async () => this.write((await this.read()).filter((x) => x.peerKey !== value.peerKey).concat(value))); }
  async list(): Promise<WeixinSessionBinding[]> { return this.lock(() => this.read()); }
  private async read(): Promise<WeixinSessionBinding[]> { return (await readJsonFile<{ bindings?: WeixinSessionBinding[] } | null>(this.filePath, null))?.bindings ?? []; }
  private async write(values: WeixinSessionBinding[]): Promise<void> { await writeJsonFileAtomically(this.filePath, { bindings: values }); }
  private async lock<T>(fn: () => Promise<T>): Promise<T> { const p = this.tail; let done!: () => void; this.tail = new Promise((r) => { done = r; }); await p.catch(() => undefined); try { return await fn(); } finally { done(); } }
}

export interface WeixinContextTokenRecord { peerKey: string; userId: string; contextToken: string; status: "active" | "invalid"; updatedAt: string; }
export class WeixinContextTokenStore {
  private tail = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async set(value: WeixinContextTokenRecord): Promise<void> { await this.lock(async () => this.write((await this.read()).filter((x) => x.peerKey !== value.peerKey).concat(value))); }
  async getUsableToken(peerKey: string): Promise<string | null> { const value = (await this.read()).find((x) => x.peerKey === peerKey); return value?.status === "active" ? value.contextToken : null; }
  async markInvalid(peerKey: string): Promise<void> { await this.lock(async () => this.write((await this.read()).map((x) => x.peerKey === peerKey ? { ...x, status: "invalid" as const, updatedAt: new Date().toISOString() } : x))); }
  private async read(): Promise<WeixinContextTokenRecord[]> { return (await readJsonFile<{ records?: WeixinContextTokenRecord[] } | null>(this.filePath, null))?.records ?? []; }
  private async write(values: WeixinContextTokenRecord[]): Promise<void> { await writeJsonFileAtomically(this.filePath, { records: values }); }
  private async lock<T>(fn: () => Promise<T>): Promise<T> { const p = this.tail; let done!: () => void; this.tail = new Promise((r) => { done = r; }); await p.catch(() => undefined); try { return await fn(); } finally { done(); } }
}
