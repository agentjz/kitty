import type { SessionStoreLike } from "../session/index.js";
import { ControlPlaneLedger } from "../control/ledger.js";
import { runBoundHostTurn } from "../host/boundTurn.js";
import { ensureBoundSession, persistBoundSession } from "../host/session.js";
import type { HostTurnRunner } from "../host/types.js";
import { resolveHostStateRoot } from "../observability/hostEvents.js";
import type { RuntimeConfig, SessionRecord } from "../types.js";
import { buildWeixinTurnInput, downloadWeixinAttachment, type WeixinAttachmentStore } from "./attachments.js";
import type { WeixinClientLike } from "./client.js";
import type { WeixinDeliveryQueue } from "./deliveryQueue.js";
import { WeixinFinalReplyDisplay } from "./finalReplyDisplay.js";
import type { WeixinLogger } from "./logger.js";
import { chunkWeixinMessage } from "./messageChunking.js";
import { WeixinOutputPort } from "./outputPort.js";
import type { WeixinSessionBinding, WeixinSessionMapStore } from "./state.js";
import type { WeixinPrivateMessage } from "./types.js";

export interface WeixinActiveTurn { controller: AbortController; sessionId: string; }

export async function runWeixinTurn(options: {
  cwd: string; config: RuntimeConfig; client: WeixinClientLike;
  sessionStore: SessionStoreLike & { load(id: string): Promise<SessionRecord> };
  sessionMap: WeixinSessionMapStore; attachments: WeixinAttachmentStore; delivery: WeixinDeliveryQueue;
  logger: WeixinLogger; message: WeixinPrivateMessage; messageKey: string; runTurn?: HostTurnRunner;
  markQueuedTurnStarted(): void; shouldAbortOnStart(): boolean;
  onActiveTurnStart(turn: WeixinActiveTurn): void; onActiveTurnEnd(): void;
}): Promise<void> {
  let { binding, session } = await ensureBinding(options);
  const enqueueText = async (text: string) => {
    for (const chunk of chunkWeixinMessage(text, options.config.weixin.messageChunkBytes)) {
      await options.delivery.enqueueText({ peerKey: options.message.peerKey, userId: options.message.userId, text: chunk });
    }
    await options.delivery.flushDue();
  };
  const output = new WeixinOutputPort(enqueueText);
  let typingTicket: string | null = null;
  const display = new WeixinFinalReplyDisplay({
    userId: options.message.userId,
    typingIntervalMs: options.config.weixin.typingIntervalMs,
    enqueueFinal: enqueueText,
    sendTyping: async () => {
      if (!options.message.contextToken) return;
      typingTicket ??= await options.client.getTypingConfig(options.message.userId, options.message.contextToken);
      if (typingTicket) await options.client.sendTyping(options.message.userId, typingTicket);
    },
  });
  try {
    const input = await buildInput(options, session.id);
    const rootDir = resolveHostStateRoot(options.config.weixin.stateDir, options.cwd);
    const ledger = new ControlPlaneLedger(rootDir);
    let turnId: string;
    try { turnId = ledger.remoteMessages.bindTurn({ host: "weixin", messageId: options.messageKey, sessionId: session.id, text: input }); }
    finally { ledger.close(); }
    const callbacks = {
      ...display.callbacks,
      enqueueFile: async (filePath: string, fileName?: string, caption?: string) => {
        const entry = await options.delivery.enqueueFile({ peerKey: options.message.peerKey, userId: options.message.userId, filePath, fileName, caption });
        await options.delivery.flushDue();
        return entry.id;
      },
    };
    session = await runBoundHostTurn<WeixinActiveTurn>({
      host: "weixin",
      buildInput: async () => input,
      cwd: options.cwd,
      stateRootDir: rootDir,
      admittedTurnId: turnId,
      config: options.config,
      session,
      sessionStore: options.sessionStore,
      output,
      display,
      callbacks,
      shouldAbortOnStart: options.shouldAbortOnStart,
      markQueuedTurnStarted: options.markQueuedTurnStarted,
      createActiveTurn: (controller, sessionId) => ({ controller, sessionId }),
      onActiveTurnStart: options.onActiveTurnStart,
      onActiveTurnEnd: options.onActiveTurnEnd,
      onCompleted: (_result, current) => options.logger.info("turn completed", { peerKey: options.message.peerKey, sessionId: current.id }),
      onFailed: (error, current) => options.logger.error("turn failed", { peerKey: options.message.peerKey, sessionId: current.id, error }),
    }, { runTurn: options.runTurn });
  } finally {
    binding = await persistBoundSession({ binding, sessionId: session.id, touchBinding, saveBinding: (value) => options.sessionMap.set(value) });
    await output.flush();
  }
}

async function buildInput(options: Parameters<typeof runWeixinTurn>[0], sessionId: string): Promise<string> {
  if (options.message.kind === "private_text_message") {
    return buildWeixinTurnInput(options.message.text, undefined, await options.attachments.listByPeer(options.message.peerKey), options.cwd);
  }
  const current = await downloadWeixinAttachment({ client: options.client, cwd: options.cwd, stateDir: options.config.weixin.stateDir, message: options.message, sessionId });
  await options.attachments.add(current);
  return buildWeixinTurnInput(options.message.text || current.text || "Analyze this Weixin attachment.", current, await options.attachments.listByPeer(options.message.peerKey), options.cwd);
}

async function ensureBinding(options: Parameters<typeof runWeixinTurn>[0]): Promise<{ binding: WeixinSessionBinding; session: SessionRecord }> {
  return ensureBoundSession({
    cwd: options.cwd,
    sessionStore: options.sessionStore,
    loadBinding: () => options.sessionMap.get(options.message.peerKey),
    createBinding: (session) => { const now = new Date().toISOString(); return { peerKey: options.message.peerKey, userId: options.message.userId, sessionId: session.id, cwd: options.cwd, createdAt: now, updatedAt: now }; },
    touchBinding,
    saveBinding: (value) => options.sessionMap.set(value),
  });
}
function touchBinding(value: WeixinSessionBinding, sessionId: string): WeixinSessionBinding { return { ...value, sessionId, updatedAt: new Date().toISOString() }; }
