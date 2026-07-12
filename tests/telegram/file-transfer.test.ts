import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import { TelegramDeliveryQueue } from "../../src/telegram/deliveryQueue.js";
import { buildFileTurnInput, buildTextTurnInput, downloadTelegramAttachment } from "../../src/telegram/inboundFiles.js";
import type {
  TelegramBotApiClient,
  TelegramFileDescriptor,
  TelegramGetFileRequest,
  TelegramSendChatActionRequest,
  TelegramSendDocumentRequest,
  TelegramSendMessageRequest,
} from "../../src/telegram/botApiClient.js";
import type { TelegramPrivateFileMessage } from "../../src/telegram/types.js";
import { createTempWorkspace, createTestRuntimeConfig } from "../helpers.js";

test("telegram inbound file is downloaded locally and exposed in turn input", async (t) => {
  const root = await createTempWorkspace("telegram-inbound-file", t);
  const config = createTestRuntimeConfig(root);
  const bot = createFileBot(Buffer.from("hello from telegram", "utf8"));
  const message = createFileMessage({
    caption: "please inspect this",
    fileName: "notes?.txt",
    fileSize: 19,
  });

  const attachment = await downloadTelegramAttachment({
    bot,
    cwd: root,
    config: config.telegram,
    message,
    sessionId: "session-1",
  });

  assert.equal(await fs.readFile(attachment.localFilePath, "utf8"), "hello from telegram");
  assert.equal(attachment.fileName, "notes?.txt");
  assert.equal(attachment.caption, "please inspect this");
  assert.match(path.basename(attachment.localFilePath), /^00000010-notes-.txt$/);

  const turnInput = buildFileTurnInput(message, attachment, [attachment], root);
  assert.match(turnInput, /The user uploaded a file/);
  assert.match(turnInput, /please inspect this/);
  assert.match(turnInput, /notes\?\.txt ->/);
  assert.match(turnInput, /Telegram context|Recent Telegram attachments/);

  const followupInput = buildTextTurnInput("use the uploaded file", [attachment], root);
  assert.match(followupInput, /use the uploaded file/);
  assert.match(followupInput, /Recent attachments from this chat/);
  assert.match(followupInput, /notes\?\.txt ->/);
  assert.doesNotMatch(followupInput, /internal wake/i);
});

test("telegram delivery queue sends queued files with sendDocument", async (t) => {
  const root = await createTempWorkspace("telegram-outbound-file", t);
  const config = createTestRuntimeConfig(root);
  const filePath = path.join(root, "result.txt");
  await fs.writeFile(filePath, "result", "utf8");
  const sentFiles: TelegramSendDocumentRequest[] = [];

  const queue = new TelegramDeliveryQueue({
    rootDir: root,
    target: {
      sendMessage: async (_request: TelegramSendMessageRequest) => undefined,
      sendDocument: async (request: TelegramSendDocumentRequest) => {
        sentFiles.push(request);
      },
    },
  });

  const entry = await queue.enqueueFile({
    chatId: 42,
    filePath,
    fileName: "display.txt",
    caption: "done",
  });

  assert.equal(entry.kind, "file");
  assert.equal((await queue.listPending()).length, 1);

  await queue.flushDue();

  assert.deepEqual(sentFiles.map(({ signal: _signal, ...request }) => request), [{
    chatId: 42,
    filePath,
    fileName: "display.txt",
    caption: "done",
  }]);
  assert.deepEqual(await queue.listPending(), []);
});

function createFileBot(content: Buffer): TelegramBotApiClient {
  return {
    getUpdates: async () => [],
    sendMessage: async (request: TelegramSendMessageRequest) => ({
      messageId: 1,
      chatId: request.chatId,
    }),
    sendChatAction: async (_request: TelegramSendChatActionRequest) => undefined,
    editMessageText: async () => undefined,
    deleteMessage: async () => undefined,
    sendDocument: async () => undefined,
    getFile: async (_request: TelegramGetFileRequest): Promise<TelegramFileDescriptor> => ({
      filePath: "documents/file.txt",
      fileSize: content.byteLength,
    }),
    downloadFile: async () => content,
  };
}

function createFileMessage(options: {
  caption: string;
  fileName: string;
  fileSize: number;
}): TelegramPrivateFileMessage {
  return {
    kind: "private_file_message",
    updateId: 10,
    peerKey: "telegram:private:100",
    userId: 42,
    chatId: 100,
    messageId: 20,
    text: options.caption,
    fileId: "file-id",
    fileUniqueId: "unique-id",
    fileName: options.fileName,
    mimeType: "text/plain",
    fileSize: options.fileSize,
    raw: {
      update_id: 10,
      message: {
        message_id: 20,
        date: 1,
        chat: {
          id: 100,
          type: "private",
        },
        from: {
          id: 42,
          is_bot: false,
          first_name: "Tester",
        },
        caption: options.caption,
        document: {
          file_id: "file-id",
          file_unique_id: "unique-id",
          file_name: options.fileName,
          mime_type: "text/plain",
          file_size: options.fileSize,
        },
      },
    },
  };
}
