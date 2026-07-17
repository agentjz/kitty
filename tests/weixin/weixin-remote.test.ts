import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { ControlPlaneLedger } from "../../src/control/ledger.js";
import { classifyWeixinMessage } from "../../src/weixin/classifier.js";
import type { WeixinClientLike } from "../../src/weixin/client.js";
import { WeixinAttachmentStore } from "../../src/weixin/attachments.js";
import { WeixinDeliveryQueue } from "../../src/weixin/deliveryQueue.js";
import { WeixinFinalReplyDisplay } from "../../src/weixin/finalReplyDisplay.js";
import { WeixinService } from "../../src/weixin/service.js";
import { WeixinContextTokenStore, WeixinCredentialStore, WeixinSessionMapStore, WeixinSyncBufStore } from "../../src/weixin/state.js";
import type { WeixinPollingSourceLike, WeixinRawMessage } from "../../src/weixin/types.js";
import { SessionStore } from "../../src/session/store.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("weixin classifier accepts whitelisted iLink text and rejects groups", () => {
  const text = classifyWeixinMessage(rawMessage({ from: "wxid_owner", text: "run tests" }), ["wxid_owner"]);
  assert.equal(text.kind, "private_text_message");
  if (text.kind === "private_text_message") {
    assert.equal(text.peerKey, "weixin:private:wxid_owner");
    assert.equal(text.contextToken, "ctx-1");
  }
  const group = classifyWeixinMessage(rawMessage({ from: "wxid_owner", text: "ignored", group: "group-1" }), ["wxid_owner"]);
  assert.equal(group.kind, "ignore");
  if (group.kind === "ignore") assert.equal(group.reason, "group_chat_unsupported");
});

test("weixin credentials are atomically stored with owner-only permissions", async (t) => {
  const root = await createTempWorkspace("weixin-credentials", t);
  const filePath = path.join(root, ".kitty", "weixin", "credentials.json");
  const store = new WeixinCredentialStore(filePath);
  await store.save({ token: "secret", baseUrl: "https://example.com", cdnBaseUrl: "https://cdn.example.com", connectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  assert.equal((await store.load())?.token, "secret");
  if (process.platform !== "win32") assert.equal((await fs.stat(filePath)).mode & 0o777, 0o600);
});

test("weixin display emits only the final assistant answer", async () => {
  const sent: string[] = [];
  const display = new WeixinFinalReplyDisplay({ userId: "wxid_owner", typingIntervalMs: 60_000, sendTyping: async () => undefined, enqueueFinal: async (text) => { sent.push(text); } });
  display.callbacks.onAssistantText?.("intermediate answer");
  display.callbacks.onToolCall?.("read", "{}");
  display.callbacks.onToolResult?.("read", "tool output");
  display.callbacks.onReasoning?.("hidden reasoning");
  display.callbacks.onAssistantDone?.("final answer only");
  await display.flush();
  display.dispose();
  assert.deepEqual(sent, ["final answer only"]);
});

test("weixin service runs a durable remote turn and sends final reply plus files", async (t) => {
  const root = await createTempWorkspace("weixin-remote", t);
  const config = createTestRuntimeConfig(root);
  config.weixin.allowedUserIds = ["wxid_owner"];
  const sentText: string[] = [];
  const sentFiles: string[] = [];
  const client = fakeClient(sentText, sentFiles);
  const contexts = new WeixinContextTokenStore(config.weixin.contextTokenFile);
  const delivery = new WeixinDeliveryQueue({ rootDir: root, client, contextTokens: contexts });
  const polling: WeixinPollingSourceLike = {
    async poll() { return { messages: [rawMessage({ from: "wxid_owner", text: "inspect repository" })], syncBuf: "sync-2" }; },
    async commit(value) { assert.equal(value, "sync-2"); },
  };
  const outputFile = path.join(root, "result.txt");
  await fs.writeFile(outputFile, "result file", "utf8");
  const service = new WeixinService({
    cwd: root,
    config,
    client,
    sessionStore: new SessionStore(config.paths.sessionsDir),
    sessionMap: new WeixinSessionMapStore(config.weixin.sessionMapFile),
    syncBuf: new WeixinSyncBufStore(config.weixin.syncBufFile),
    contextTokens: contexts,
    attachments: new WeixinAttachmentStore(config.weixin.attachmentStoreFile),
    delivery,
    logger: { info() {}, error() {} },
    polling,
    runTurn: async (options) => {
      options.callbacks?.onReasoning?.("must stay hidden");
      options.callbacks?.onToolCall?.("read", "{}");
      options.callbacks?.onToolResult?.("read", "must stay hidden");
      await options.callbacks?.enqueueFile?.(outputFile, "result.txt");
      options.callbacks?.onAssistantDone?.("WEIXIN_FINAL_SENTINEL");
      return { session: options.session, changedPaths: [] };
    },
  });

  await service.runOnce();
  await service.waitForIdle();

  assert.deepEqual(sentText, ["WEIXIN_FINAL_SENTINEL"]);
  assert.deepEqual(sentFiles, ["result.txt"]);
  const ledger = new ControlPlaneLedger(root);
  try {
    assert.equal(ledger.remoteMessages.listOutbox("weixin").every((entry) => entry.status === "sent"), true);
    assert.equal(ledger.remoteMessages.listOutbox("telegram").length, 0);
    assert.equal(ledger.turns.listBySession((await new SessionStore(config.paths.sessionsDir).loadLatest())!.id).length, 1);
  } finally { ledger.close(); }
});

function rawMessage(input: { from: string; text: string; group?: string }): WeixinRawMessage {
  return {
    from_user_id: input.from,
    to_user_id: "kitty",
    group_id: input.group ?? "",
    message_id: 101,
    seq: 7,
    message_type: 1,
    context_token: "ctx-1",
    item_list: [{ type: 1, text_item: { text: input.text } }],
  } as WeixinRawMessage;
}

function fakeClient(sentText: string[], sentFiles: string[]): WeixinClientLike {
  return {
    async loginWithQr() { throw new Error("not used"); },
    async getUpdates() { return { messages: [], syncBuf: null }; },
    async getTypingConfig() { return null; },
    async sendTyping() {},
    async sendText(input) { sentText.push(input.text); },
    async sendFile(input) { sentFiles.push(input.fileName ?? path.basename(input.filePath)); },
    async downloadMedia() { return new Uint8Array(); },
    async downloadVoice() { return new Uint8Array(); },
  };
}
