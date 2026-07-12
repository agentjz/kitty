import type { ShellOutputPort } from "../interaction/shell.js";
import { chunkTelegramMessage } from "./messageChunking.js";
import { translate, type KittyLocale } from "../i18n/index.js";

export class TelegramOutputPort implements ShellOutputPort {
  private readonly pending: Promise<unknown>[] = [];

  constructor(
    private readonly options: {
      chatId: number;
      locale: KittyLocale;
      messageChunkChars: number;
      enqueueReply: (chatId: number, text: string) => Promise<void>;
    },
  ) {}

  plain(text: string): void {
    this.queue(text);
  }

  info(text: string): void {
    this.queue(text);
  }

  warn(text: string): void {
    this.queue(`${translate(this.options.locale, "telegram.prefix.warning")}: ${text}`);
  }

  error(text: string): void {
    this.queue(`${translate(this.options.locale, "telegram.prefix.error")}: ${text}`);
  }

  dim(text: string): void {
    this.queue(text);
  }

  heading(text: string): void {
    this.queue(text);
  }

  interrupt(text: string): void {
    this.queue(`${translate(this.options.locale, "telegram.prefix.interrupt")}: ${text}`);
  }

  async flush(): Promise<void> {
    if (this.pending.length === 0) {
      return;
    }

    const tasks = this.pending.splice(0, this.pending.length);
    await Promise.all(tasks);
  }

  private queue(text: string): void {
    for (const chunk of chunkTelegramMessage(text, this.options.messageChunkChars)) {
      this.pending.push(this.options.enqueueReply(this.options.chatId, chunk));
    }
  }
}
