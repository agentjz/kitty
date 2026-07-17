import { ControlPlaneLedger } from "../control/ledger.js";
import type { RemoteOutboxRecord } from "../control/remoteMessages.js";

export class RemoteDeliveryDeferredError extends Error {}

export interface RemoteDeliveryEntry {
  id: string;
  host: string;
  recipientKey: string;
  kind: "text" | "file";
  payload: Record<string, unknown>;
  createdAt: number;
}

export class RemoteDeliveryQueue {
  private operationTail = Promise.resolve();
  private readonly observers = new Set<{
    onDelivered?(entry: RemoteDeliveryEntry): void;
    onDeliveryFailed?(entry: RemoteDeliveryEntry, error: unknown): void;
  }>();

  constructor(private readonly options: {
    rootDir: string;
    host: string;
    deliver: (entry: RemoteDeliveryEntry) => Promise<{ remoteMessageId?: string | number } | void>;
    onDelivered?: (entry: RemoteDeliveryEntry) => void;
    onDeliveryFailed?: (entry: RemoteDeliveryEntry, error: unknown) => void;
  }) {
    const ledger = new ControlPlaneLedger(options.rootDir);
    try { ledger.remoteMessages.recoverSending(options.host); }
    finally { ledger.close(); }
  }

  async enqueue(input: { recipientKey: string; kind: "text" | "file"; payload: Record<string, unknown> }): Promise<RemoteDeliveryEntry> {
    return this.withLock(async () => {
      const ledger = new ControlPlaneLedger(this.options.rootDir);
      try {
        return toEntry(ledger.remoteMessages.enqueue({ host: this.options.host, ...input }));
      } finally { ledger.close(); }
    });
  }

  async flushDue(): Promise<void> {
    await this.withLock(async () => {
      for (;;) {
        const ledger = new ControlPlaneLedger(this.options.rootDir);
        let claimed: RemoteOutboxRecord | undefined;
        try { claimed = ledger.remoteMessages.claimNext(this.options.host); }
        finally { ledger.close(); }
        if (!claimed) return;
        const entry = toEntry(claimed);
        try {
          const response = await this.options.deliver(entry);
          const settle = new ControlPlaneLedger(this.options.rootDir);
          try {
            settle.remoteMessages.settleOutbox({
              id: claimed.id,
              deliveryToken: claimed.deliveryToken!,
              status: "sent",
              remoteMessageId: response?.remoteMessageId === undefined ? undefined : String(response.remoteMessageId),
            });
          } finally { settle.close(); }
          this.options.onDelivered?.(entry);
          for (const observer of this.observers) observer.onDelivered?.(entry);
        } catch (error) {
          const settle = new ControlPlaneLedger(this.options.rootDir);
          try {
            if (error instanceof RemoteDeliveryDeferredError) {
              settle.remoteMessages.deferOutbox(claimed.id, claimed.deliveryToken!, error.message);
              return;
            }
            settle.remoteMessages.settleOutbox({
              id: claimed.id,
              deliveryToken: claimed.deliveryToken!,
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

  async listPending(): Promise<RemoteDeliveryEntry[]> {
    return this.withLock(async () => {
      const ledger = new ControlPlaneLedger(this.options.rootDir);
      try { return ledger.remoteMessages.listOutbox(this.options.host, ["queued", "sending", "uncertain"]).map(toEntry); }
      finally { ledger.close(); }
    });
  }

  subscribe(observer: { onDelivered?(entry: RemoteDeliveryEntry): void; onDeliveryFailed?(entry: RemoteDeliveryEntry, error: unknown): void }): () => void {
    this.observers.add(observer);
    return () => this.observers.delete(observer);
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

function toEntry(record: RemoteOutboxRecord): RemoteDeliveryEntry {
  return {
    id: record.id,
    host: record.host,
    recipientKey: record.recipientKey,
    kind: record.kind,
    payload: record.payload,
    createdAt: Date.parse(record.createdAt),
  };
}
