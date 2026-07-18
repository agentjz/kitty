import fs from "node:fs/promises";

import type { SessionStoreLike } from "../session/index.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { collectRunningExecutionProcesses, terminateRunningExecutionProcesses } from "../execution/lifecycle.js";
import type { HostTurnRunner } from "../host/types.js";
import { QueuedHostMessageRecorder, resolveHostStateRoot } from "../observability/hostEvents.js";
import { PerPeerCommandQueue } from "../remote/commandQueue.js";
import { RemoteTurnState } from "../remote/turnState.js";
import { waitAtMost } from "../remote/serviceLifecycle.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import type { WeixinAttachmentStore } from "./attachments.js";
import { classifyWeixinMessage } from "./classifier.js";
import type { WeixinClientLike } from "./client.js";
import type { WeixinDeliveryQueue } from "./deliveryQueue.js";
import type { WeixinLogger } from "./logger.js";
import { WeixinPollingSource } from "./polling.js";
import type { WeixinContextTokenStore, WeixinSessionMapStore, WeixinSyncBufStore } from "./state.js";
import { runWeixinTurn, type WeixinActiveTurn } from "./turnRunner.js";
import type { WeixinPollingSourceLike, WeixinRawMessage } from "./types.js";
import { formatRemoteBlockedCommand, formatRemoteCommandHelp, parseRemoteCommand, type RemoteCommandId } from "../remote/commands.js";
import { formatRemoteRuntimeStatus } from "../remote/status.js";
import { createPersistedSession } from "../host/session.js";
import { translate } from "../i18n/index.js";

export class WeixinService {
  private readonly queue = new PerPeerCommandQueue();
  private readonly turns = new RemoteTurnState<WeixinActiveTurn>();
  private readonly polling: WeixinPollingSourceLike;
  private readonly tasks = new Set<Promise<void>>();
  private readonly commits = new Set<Promise<void>>();
  private commitTail = Promise.resolve();
  private readonly observability: QueuedHostMessageRecorder;
  private stopped = false;
  constructor(private readonly options: {
    cwd: string; config: RuntimeConfig; client: WeixinClientLike;
    sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
    sessionMap: WeixinSessionMapStore; syncBuf: WeixinSyncBufStore; contextTokens: WeixinContextTokenStore;
    attachments: WeixinAttachmentStore; delivery: WeixinDeliveryQueue; logger: WeixinLogger;
    polling?: WeixinPollingSourceLike; runTurn?: HostTurnRunner; sleep?: (ms: number) => Promise<void>;
  }) {
    this.polling = options.polling ?? new WeixinPollingSource(options.client, options.syncBuf, options.config.weixin);
    this.observability = new QueuedHostMessageRecorder(resolveHostStateRoot(options.config.weixin.stateDir, options.cwd), "weixin");
  }
  stop(): void { this.stopped = true; this.turns.abortAllActiveTurns("Weixin service stopping."); }
  async run(signal?: AbortSignal): Promise<void> {
    await fs.mkdir(this.options.config.weixin.stateDir, { recursive: true });
    try {
      while (!this.stopped && !signal?.aborted) {
        try { await this.runOnce(signal); }
        catch (error) {
          if (signal?.aborted) break;
          this.options.logger.error("polling failure", { error: error instanceof Error ? error.message : String(error) });
          await (this.options.sleep ? this.options.sleep(this.options.config.weixin.pollingRetryBackoffMs) : new Promise((r) => setTimeout(r, this.options.config.weixin.pollingRetryBackoffMs)));
        }
      }
    } finally {
      const sessions = this.turns.listActiveSessionIds();
      await waitAtMost(this.waitForIdle(), 5_000);
      const root = resolveHostStateRoot(this.options.config.weixin.stateDir, this.options.cwd);
      for (const sessionId of sessions) terminateRunningExecutionProcesses(root, collectRunningExecutionProcesses(root, sessionId));
      await this.observability.waitForIdle();
    }
  }
  async runOnce(signal?: AbortSignal): Promise<void> {
    await this.options.delivery.flushDue();
    const batch = await this.polling.poll(signal);
    const admitted = await Promise.all(batch.messages.map((message) => this.process(message)));
    const tasks = admitted.map((item) => item?.task).filter((task): task is Promise<void> => Boolean(task));
    this.polling.stage?.(batch.syncBuf);
    const terminal = Promise.allSettled(tasks);
    const commit = this.commitTail
      .then(() => terminal)
      .then(() => this.polling.commit(batch.syncBuf))
      .finally(() => this.commits.delete(commit));
    this.commitTail = commit.catch(() => undefined);
    this.commits.add(commit);
    void commit.catch((error) => this.options.logger.error("sync buffer commit failure", { error: error instanceof Error ? error.message : String(error) }));
    await this.options.delivery.flushDue();
  }
  async waitForIdle(): Promise<void> {
    await Promise.allSettled([...this.tasks]);
    await Promise.allSettled([...this.commits]);
    await this.observability.waitForIdle();
  }

  private async process(raw: WeixinRawMessage): Promise<{ task: Promise<void> } | null> {
    const messageKey = `${Number(raw.seq ?? 0)}:${Number(raw.message_id ?? 0)}`;
    const classified = classifyWeixinMessage(raw, this.options.config.weixin.allowedUserIds);
    const root = resolveHostStateRoot(this.options.config.weixin.stateDir, this.options.cwd);
    const ledger = new ControlPlaneLedger(root);
    let claimed: boolean;
    try { claimed = ledger.remoteMessages.claimInbox({ host: "weixin", messageId: messageKey, peerKey: "peerKey" in classified ? classified.peerKey : undefined }); }
    finally { ledger.close(); }
    if (!claimed) return null;
    if (classified.kind === "ignore" || classified.kind === "outbound_echo") { this.mark(messageKey, "completed"); return null; }
    if (classified.contextToken) await this.options.contextTokens.set({ peerKey: classified.peerKey, userId: classified.userId, contextToken: classified.contextToken, status: "active", updatedAt: new Date().toISOString() });
    if (classified.kind === "private_text_message") {
      const command = parseRemoteCommand(classified.text, "weixin");
      if (command) {
        await this.handleRemoteCommand(command, classified, messageKey, root);
        return null;
      }
      if (classified.text.trim().startsWith("/")) {
        await this.reply(classified.peerKey, classified.userId, formatRemoteBlockedCommand(this.options.config.locale));
        this.mark(messageKey, "completed");
        return null;
      }
    }
    this.observability.queue("accepted", { peerKey: classified.peerKey, userId: classified.userId, kind: classified.kind });
    this.turns.incrementQueuedTurns(classified.peerKey);
    const task = this.queue.enqueue(classified.peerKey, () => runWeixinTurn({
      ...this.options,
      message: classified,
      messageKey,
      markQueuedTurnStarted: () => this.turns.decrementQueuedTurns(classified.peerKey),
      onActiveTurnStart: (turn) => this.turns.setActiveTurn(classified.peerKey, turn),
      onActiveTurnEnd: () => this.turns.clearActiveTurn(classified.peerKey),
    })).then(() => this.mark(messageKey, "completed"), (error) => { this.mark(messageKey, "failed", error); throw error; });
    this.tasks.add(task);
    void task.finally(() => this.tasks.delete(task)).catch(() => undefined);
    return { task };
  }
  private mark(messageId: string, status: "completed" | "failed", error?: unknown): void {
    const ledger = new ControlPlaneLedger(resolveHostStateRoot(this.options.config.weixin.stateDir, this.options.cwd));
    try { ledger.remoteMessages.markInbox({ host: "weixin", messageId, status, error: error instanceof Error ? error.message : error ? String(error) : undefined }); }
    finally { ledger.close(); }
  }

  private async handleRemoteCommand(
    command: RemoteCommandId,
    message: Extract<ReturnType<typeof classifyWeixinMessage>, { kind: "private_text_message" }>,
    messageKey: string,
    rootDir: string,
  ): Promise<void> {
    if (command === "stop") {
      const active = this.turns.getActiveTurn(message.peerKey);
      if (active && !active.controller.signal.aborted) {
        active.controller.abort("Stopped from Weixin.");
        await this.reply(message.peerKey, message.userId, translate(this.options.config.locale, "remote.stopConfirmed"));
      } else {
        await this.reply(message.peerKey, message.userId, translate(this.options.config.locale, "remote.noTask"));
      }
      this.mark(messageKey, "completed");
      return;
    }
    if (command === "help") {
      await this.reply(message.peerKey, message.userId, formatRemoteCommandHelp("weixin", this.options.config.locale));
      this.mark(messageKey, "completed");
      return;
    }
    if (command === "status") {
      const binding = await this.options.sessionMap.get(message.peerKey);
      const text = binding
        ? await formatRemoteRuntimeStatus({ rootDir, config: this.options.config, sessionId: binding.sessionId })
        : translate(this.options.config.locale, "remote.noSession");
      await this.reply(message.peerKey, message.userId, text);
      this.mark(messageKey, "completed");
      return;
    }

    const active = this.turns.getActiveTurn(message.peerKey);
    if (active && !active.controller.signal.aborted) active.controller.abort("New Weixin session requested.");
    try {
      await this.queue.enqueue(message.peerKey, async () => {
        const session = await createPersistedSession(this.options.sessionStore, this.options.cwd);
        const now = new Date().toISOString();
        await this.options.sessionMap.set({
          peerKey: message.peerKey,
          userId: message.userId,
          sessionId: session.id,
          cwd: this.options.cwd,
          createdAt: now,
          updatedAt: now,
        });
        await this.reply(message.peerKey, message.userId, translate(this.options.config.locale, "remote.newConfirmed"));
      });
      this.mark(messageKey, "completed");
    } catch (error) {
      this.mark(messageKey, "failed", error);
      throw error;
    }
  }

  private async reply(peerKey: string, userId: string, text: string): Promise<void> {
    await this.options.delivery.enqueueText({ peerKey, userId, text });
    await this.options.delivery.flushDue();
  }
}
