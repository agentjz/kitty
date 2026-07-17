import { RemoteDeliveryQueue, type RemoteDeliveryEntry } from "../remote/deliveryQueue.js";
import type { TelegramSendDocumentRequest, TelegramSendMessageRequest } from "./botApiClient.js";

export interface TelegramDeliveryTarget {
  sendMessage(request: TelegramSendMessageRequest): Promise<unknown>;
  sendDocument(request: TelegramSendDocumentRequest): Promise<unknown>;
}

interface TelegramDeliveryEntryBase { id: string; kind: "text" | "file"; chatId: number; createdAt: number; }
export interface TelegramTextDeliveryEntry extends TelegramDeliveryEntryBase { kind: "text"; text: string; }
export interface TelegramFileDeliveryEntry extends TelegramDeliveryEntryBase { kind: "file"; filePath: string; fileName?: string; caption?: string; }
export type TelegramDeliveryEntry = TelegramTextDeliveryEntry | TelegramFileDeliveryEntry;
export interface TelegramDeliveryObserver {
  onDelivered?(entry: TelegramDeliveryEntry): void;
  onDeliveryFailed?(entry: TelegramDeliveryEntry, error: unknown): void;
}

export class TelegramDeliveryQueue {
  private readonly queue: RemoteDeliveryQueue;
  private readonly observers = new Set<TelegramDeliveryObserver>();

  constructor(options: {
    rootDir: string;
    target: TelegramDeliveryTarget;
    onDelivered?: (entry: TelegramDeliveryEntry) => void;
    onDeliveryFailed?: (entry: TelegramDeliveryEntry, error: unknown) => void;
  }) {
    this.queue = new RemoteDeliveryQueue({
      rootDir: options.rootDir,
      host: "telegram",
      deliver: async (entry) => {
        const value = fromRemote(entry);
        if (value.kind === "file") {
          await options.target.sendDocument({
            chatId: value.chatId,
            filePath: value.filePath,
            fileName: value.fileName,
            caption: value.caption,
            signal: AbortSignal.timeout(30_000),
          });
          return;
        }
        const response = await options.target.sendMessage({
          chatId: value.chatId,
          text: value.text,
          signal: AbortSignal.timeout(15_000),
        });
        const messageId = readRemoteMessageId(response);
        return messageId === undefined ? undefined : { remoteMessageId: messageId };
      },
      onDelivered: (entry) => {
        const value = fromRemote(entry);
        options.onDelivered?.(value);
        for (const observer of this.observers) observer.onDelivered?.(value);
      },
      onDeliveryFailed: (entry, error) => {
        const value = fromRemote(entry);
        options.onDeliveryFailed?.(value, error);
        for (const observer of this.observers) observer.onDeliveryFailed?.(value, error);
      },
    });
  }

  async enqueue(input: { chatId: number; text: string }): Promise<TelegramTextDeliveryEntry> {
    return fromRemote(await this.queue.enqueue({ recipientKey: String(input.chatId), kind: "text", payload: { text: input.text } })) as TelegramTextDeliveryEntry;
  }
  async enqueueFile(input: { chatId: number; filePath: string; fileName?: string; caption?: string }): Promise<TelegramFileDeliveryEntry> {
    return fromRemote(await this.queue.enqueue({ recipientKey: String(input.chatId), kind: "file", payload: input })) as TelegramFileDeliveryEntry;
  }
  async flushDue(): Promise<void> { await this.queue.flushDue(); }
  async listPending(): Promise<TelegramDeliveryEntry[]> { return (await this.queue.listPending()).map(fromRemote); }
  subscribe(observer: TelegramDeliveryObserver): () => void { this.observers.add(observer); return () => this.observers.delete(observer); }
}

function fromRemote(entry: RemoteDeliveryEntry): TelegramDeliveryEntry {
  const base = { id: entry.id, chatId: Number(entry.recipientKey), createdAt: entry.createdAt };
  if (entry.kind === "file") return {
    ...base,
    kind: "file",
    filePath: String(entry.payload.filePath ?? ""),
    fileName: typeof entry.payload.fileName === "string" ? entry.payload.fileName : undefined,
    caption: typeof entry.payload.caption === "string" ? entry.payload.caption : undefined,
  };
  return { ...base, kind: "text", text: String(entry.payload.text ?? "") };
}

function readRemoteMessageId(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const id = (value as { messageId?: unknown }).messageId;
  return typeof id === "number" ? id : undefined;
}
