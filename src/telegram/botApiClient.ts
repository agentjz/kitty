import fs from "node:fs/promises";
import path from "node:path";

import type { TelegramUpdate } from "./types.js";

export interface TelegramGetUpdatesRequest {
  offset?: number;
  limit: number;
  timeoutSeconds: number;
  signal?: AbortSignal;
}

export interface TelegramSendMessageRequest {
  chatId: number;
  text: string;
  signal?: AbortSignal;
}

export interface TelegramSentMessage {
  messageId: number;
  chatId: number;
}

export interface TelegramSendChatActionRequest {
  chatId: number;
  action: "typing";
  signal?: AbortSignal;
}

export interface TelegramEditMessageTextRequest {
  chatId: number;
  messageId: number;
  text: string;
  signal?: AbortSignal;
}

export interface TelegramDeleteMessageRequest {
  chatId: number;
  messageId: number;
  signal?: AbortSignal;
}

export interface TelegramSendDocumentRequest {
  chatId: number;
  filePath: string;
  fileName?: string;
  caption?: string;
  signal?: AbortSignal;
}

export interface TelegramGetFileRequest {
  fileId: string;
  signal?: AbortSignal;
}

export interface TelegramFileDescriptor {
  filePath: string;
  fileSize?: number;
}

export interface TelegramBotApiClient {
  getUpdates(request: TelegramGetUpdatesRequest): Promise<TelegramUpdate[]>;
  sendMessage(request: TelegramSendMessageRequest): Promise<TelegramSentMessage>;
  sendChatAction(request: TelegramSendChatActionRequest): Promise<void>;
  editMessageText(request: TelegramEditMessageTextRequest): Promise<void>;
  deleteMessage(request: TelegramDeleteMessageRequest): Promise<void>;
  sendDocument(request: TelegramSendDocumentRequest): Promise<void>;
  getFile(request: TelegramGetFileRequest): Promise<TelegramFileDescriptor>;
  downloadFile(request: TelegramFileDescriptor & { signal?: AbortSignal }): Promise<Buffer>;
}

export class FetchTelegramBotApiClient implements TelegramBotApiClient {
  private readonly baseUrl: string;
  private readonly fileBaseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly token: string;

  constructor(options: {
    token: string;
    apiBaseUrl: string;
    fetchImpl?: typeof fetch;
  }) {
    const normalizedApiBaseUrl = options.apiBaseUrl.replace(/\/+$/u, "");
    this.baseUrl = `${normalizedApiBaseUrl}/bot${options.token}`;
    this.fileBaseUrl = `${normalizedApiBaseUrl}/file/bot${options.token}`;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.token = options.token;
  }

  async getUpdates(request: TelegramGetUpdatesRequest): Promise<TelegramUpdate[]> {
    const result = await this.post<TelegramUpdate[]>(
      "getUpdates",
      {
        offset: request.offset,
        limit: request.limit,
        timeout: request.timeoutSeconds,
        allowed_updates: ["message"],
      },
      request.signal,
    );

    return Array.isArray(result) ? result : [];
  }

  async sendMessage(request: TelegramSendMessageRequest): Promise<TelegramSentMessage> {
    const message = await this.post<{
      message_id?: number;
      chat?: {
        id?: number;
      };
    }>("sendMessage", {
      chat_id: request.chatId,
      text: request.text,
    }, request.signal ?? AbortSignal.timeout(15_000));

    return {
      messageId: Math.trunc(message?.message_id ?? 0),
      chatId: Math.trunc(message?.chat?.id ?? request.chatId),
    };
  }

  async sendChatAction(request: TelegramSendChatActionRequest): Promise<void> {
    await this.post("sendChatAction", {
      chat_id: request.chatId,
      action: request.action,
    }, request.signal ?? AbortSignal.timeout(15_000));
  }

  async editMessageText(request: TelegramEditMessageTextRequest): Promise<void> {
    await this.post("editMessageText", {
      chat_id: request.chatId,
      message_id: request.messageId,
      text: request.text,
    }, request.signal ?? AbortSignal.timeout(15_000));
  }

  async deleteMessage(request: TelegramDeleteMessageRequest): Promise<void> {
    await this.post("deleteMessage", {
      chat_id: request.chatId,
      message_id: request.messageId,
    }, request.signal ?? AbortSignal.timeout(15_000));
  }

  async sendDocument(request: TelegramSendDocumentRequest): Promise<void> {
    const fileName = request.fileName?.trim() || path.basename(request.filePath);
    const buffer = await fs.readFile(request.filePath);
    const form = new FormData();
    form.set("chat_id", String(request.chatId));
    form.set("document", new Blob([buffer]), fileName);
    if (request.caption?.trim()) {
      form.set("caption", request.caption.trim());
    }

    const response = await this.fetchImpl(`${this.baseUrl}/sendDocument`, {
      method: "POST",
      body: form,
      signal: request.signal ?? AbortSignal.timeout(30_000),
    });

    const payload = await response.json() as {
      ok?: boolean;
      description?: string;
    };
    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.description || `Telegram API sendDocument failed with status ${response.status}`);
    }
  }

  async getFile(request: TelegramGetFileRequest): Promise<TelegramFileDescriptor> {
    const result = await this.post<{
      file_path?: string;
      file_size?: number;
    }>("getFile", {
      file_id: request.fileId,
    }, request.signal ?? AbortSignal.timeout(15_000));

    const filePath = String(result?.file_path ?? "").trim();
    if (!filePath) {
      throw new Error(`Telegram API getFile did not return file_path for ${request.fileId}`);
    }

    return {
      filePath,
      fileSize:
        typeof result?.file_size === "number" && Number.isFinite(result.file_size)
          ? Math.trunc(result.file_size)
          : undefined,
    };
  }

  async downloadFile(request: TelegramFileDescriptor & { signal?: AbortSignal }): Promise<Buffer> {
    const response = await this.fetchImpl(`${this.fileBaseUrl}/${request.filePath.replace(/^\/+/u, "")}`, {
      method: "GET",
      signal: request.signal ?? AbortSignal.timeout(30_000),
    });
    if (!response.ok) {
      throw new Error(`Telegram file download failed with status ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private async post<T = unknown>(method: string, body: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
    const response = await this.fetchImpl(`${this.baseUrl}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
      signal,
    });

    const payload = await response.json() as {
      ok?: boolean;
      result?: T;
      description?: string;
    };

    if (!response.ok || payload.ok !== true) {
      throw new Error(payload.description || `Telegram API ${method} failed with status ${response.status}`);
    }

    return payload.result as T;
  }
}
