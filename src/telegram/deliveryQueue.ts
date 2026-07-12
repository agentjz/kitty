import { ControlPlaneLedger } from "../control/ledger.js";
import type { TelegramOutboxRecord } from "../control/telegram.js";
import type { TelegramSendDocumentRequest, TelegramSendMessageRequest } from "./botApiClient.js";

export interface TelegramDeliveryTarget {
  sendMessage(request: TelegramSendMessageRequest): Promise<unknown>;
  sendDocument(request: TelegramSendDocumentRequest): Promise<unknown>;
}

interface TelegramDeliveryEntryBase {
  id: string;
  kind: "text" | "file";
  chatId: number;
  createdAt: number;
}

export interface TelegramTextDeliveryEntry extends TelegramDeliveryEntryBase {
  kind: "text";
  text: string;
}

export interface TelegramFileDeliveryEntry extends TelegramDeliveryEntryBase {
  kind: "file";
  filePath: string;
  fileName?: string;
  caption?: string;
}

export type TelegramDeliveryEntry = TelegramTextDeliveryEntry | TelegramFileDeliveryEntry;

export interface TelegramDeliveryObserver {
  onDelivered?(entry: TelegramDeliveryEntry): void;
  onDeliveryFailed?(entry: TelegramDeliveryEntry, error: unknown): void;
}

export class TelegramDeliveryQueue {
  private operationTail = Promise.resolve();
  private readonly observers = new Set<TelegramDeliveryObserver>();

  constructor(private readonly options: {
    rootDir: string;
    target: TelegramDeliveryTarget;
    onDelivered?: (entry: TelegramDeliveryEntry) => void;
    onDeliveryFailed?: (entry: TelegramDeliveryEntry, error: unknown) => void;
  }) {
    const ledger = new ControlPlaneLedger(options.rootDir);
    try { ledger.telegram.recoverSending(); }
    finally { ledger.close(); }
  }

  async enqueue(input: { chatId: number; text: string }): Promise<TelegramTextDeliveryEntry> {
    return this.withLock(async () => this.enqueueRecord("text", input.chatId, { text: input.text }) as TelegramTextDeliveryEntry);
  }

  async enqueueFile(input: { chatId: number; filePath: string; fileName?: string; caption?: string }): Promise<TelegramFileDeliveryEntry> {
    return this.withLock(async () => this.enqueueRecord("file", input.chatId, {
      filePath: input.filePath,
      fileName: input.fileName,
      caption: input.caption,
    }) as TelegramFileDeliveryEntry);
  }

  async flushDue(): Promise<void> {
    await this.withLock(async () => {
      for (;;) {
        const ledger = new ControlPlaneLedger(this.options.rootDir);
        let claimed: TelegramOutboxRecord | undefined;
        try { claimed = ledger.telegram.claimNext(); }
        finally { ledger.close(); }
        if (!claimed) return;
        const entry = toDeliveryEntry(claimed);
        try {
          const response = await this.deliver(entry);
          const remoteMessageId = readRemoteMessageId(response);
          const settle = new ControlPlaneLedger(this.options.rootDir);
          try {
            settle.telegram.settleOutbox(claimed.id, claimed.deliveryToken!, { status: "sent", remoteMessageId });
          } finally { settle.close(); }
          this.options.onDelivered?.(entry);
          for (const observer of this.observers) observer.onDelivered?.(entry);
        } catch (error) {
          const settle = new ControlPlaneLedger(this.options.rootDir);
          try {
            settle.telegram.settleOutbox(claimed.id, claimed.deliveryToken!, {
              status: "uncertain",
              error: error instanceof Error ? error.message : String(error),
            });
          } finally { settle.close(); }
          this.options.onDeliveryFailed?.(entry, error);
          for (const observer of this.observers) observer.onDeliveryFailed?.(entry, error);
        }
      }
    });
  }

  async listPending(): Promise<TelegramDeliveryEntry[]> {
    return this.withLock(async () => {
      const ledger = new ControlPlaneLedger(this.options.rootDir);
      try {
        return ledger.telegram.listOutbox(["queued", "sending", "uncertain"]).map(toDeliveryEntry);
      } finally { ledger.close(); }
    });
  }

  subscribe(observer: TelegramDeliveryObserver): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
  }

  private enqueueRecord(kind: "text" | "file", chatId: number, payload: Record<string, unknown>): TelegramDeliveryEntry {
    const ledger = new ControlPlaneLedger(this.options.rootDir);
    try { return toDeliveryEntry(ledger.telegram.enqueue({ chatId, kind, payload })); }
    finally { ledger.close(); }
  }

  private async deliver(entry: TelegramDeliveryEntry): Promise<unknown> {
    if (entry.kind === "file") {
      return this.options.target.sendDocument({
        chatId: entry.chatId,
        filePath: entry.filePath,
        fileName: entry.fileName,
        caption: entry.caption,
        signal: AbortSignal.timeout(30_000),
      });
    }
    return this.options.target.sendMessage({ chatId: entry.chatId, text: entry.text, signal: AbortSignal.timeout(15_000) });
  }

  private async withLock<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.operationTail;
    let release!: () => void;
    this.operationTail = new Promise<void>((resolve) => { release = resolve; });
    await previous.catch(() => undefined);
    try { return await operation(); }
    finally { release(); }
  }
}

function toDeliveryEntry(record: TelegramOutboxRecord): TelegramDeliveryEntry {
  const base = { id: record.id, chatId: record.chatId, createdAt: Date.parse(record.createdAt) };
  if (record.kind === "file") {
    return {
      ...base,
      kind: "file",
      filePath: String(record.payload.filePath ?? ""),
      fileName: typeof record.payload.fileName === "string" ? record.payload.fileName : undefined,
      caption: typeof record.payload.caption === "string" ? record.payload.caption : undefined,
    };
  }
  return { ...base, kind: "text", text: String(record.payload.text ?? "") };
}

function readRemoteMessageId(value: unknown): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const messageId = (value as { messageId?: unknown }).messageId;
  return typeof messageId === "number" ? messageId : undefined;
}
