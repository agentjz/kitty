import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type { WeixinClientLike } from "./client.js";
import { readJsonFile, writeJsonFileAtomically } from "./storage.js";
import type { WeixinPrivateMessage } from "./types.js";

export interface WeixinAttachmentRecord {
  id: string; peerKey: string; userId: string; sessionId: string; mediaKind: "image" | "video" | "file" | "voice"; localFilePath: string; fileName?: string; text?: string; createdAt: string;
}
export class WeixinAttachmentStore {
  private tail = Promise.resolve();
  constructor(private readonly filePath: string) {}
  async add(value: WeixinAttachmentRecord): Promise<void> { await this.lock(async () => { const all = (await this.read()).filter((x) => x.id !== value.id).concat(value).slice(-200); await writeJsonFileAtomically(this.filePath, { attachments: all }); }); }
  async listByPeer(peerKey: string, limit = 5): Promise<WeixinAttachmentRecord[]> { return (await this.read()).filter((x) => x.peerKey === peerKey).slice(-limit).reverse(); }
  private async read(): Promise<WeixinAttachmentRecord[]> { return (await readJsonFile<{ attachments?: WeixinAttachmentRecord[] } | null>(this.filePath, null))?.attachments ?? []; }
  private async lock<T>(fn: () => Promise<T>): Promise<T> { const p = this.tail; let done!: () => void; this.tail = new Promise((r) => { done = r; }); await p.catch(() => undefined); try { return await fn(); } finally { done(); } }
}

export async function downloadWeixinAttachment(input: { client: WeixinClientLike; cwd: string; stateDir: string; message: Exclude<WeixinPrivateMessage, { kind: "private_text_message" }>; sessionId: string }): Promise<WeixinAttachmentRecord> {
  const dir = path.join(input.stateDir, "inbound", input.sessionId);
  await fs.mkdir(dir, { recursive: true });
  const extension = input.message.mediaKind === "image" ? ".jpg" : input.message.mediaKind === "video" ? ".mp4" : input.message.mediaKind === "voice" ? ".pcm" : "";
  const fileName = sanitize(input.message.kind === "private_file_message" ? input.message.fileName : undefined) || `${input.message.mediaKind}-${input.message.messageId}${extension}`;
  const filePath = path.join(dir, fileName);
  const bytes = input.message.kind === "private_voice_message" ? await input.client.downloadVoice(input.message.voice) : await input.client.downloadMedia(input.message.media);
  await fs.writeFile(filePath, bytes);
  return { id: `weixin-file-${crypto.randomUUID()}`, peerKey: input.message.peerKey, userId: input.message.userId, sessionId: input.sessionId, mediaKind: input.message.mediaKind, localFilePath: filePath, fileName, text: input.message.text || (input.message.kind === "private_voice_message" ? input.message.voiceTranscript : undefined), createdAt: new Date().toISOString() };
}

export function buildWeixinTurnInput(text: string, current: WeixinAttachmentRecord | undefined, recent: readonly WeixinAttachmentRecord[], cwd: string): string {
  const lines = [text.trim()];
  if (current) lines.push(`Weixin attachment: ${path.relative(cwd, current.localFilePath) || current.localFilePath} (${current.mediaKind})`);
  const others = recent.filter((x) => x.id !== current?.id);
  if (others.length) lines.push("Recent attachments from this Weixin chat:", ...others.map((x) => `- ${path.relative(cwd, x.localFilePath) || x.localFilePath}`));
  return lines.filter(Boolean).join("\n\n");
}

function sanitize(value: string | undefined): string { return path.basename(String(value ?? "")).replace(/[<>:"/\\|?*\x00-\x1f]/gu, "_").trim(); }
