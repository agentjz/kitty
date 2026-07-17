import type { ShellOutputPort } from "../interaction/shell.js";

export class WeixinOutputPort implements ShellOutputPort {
  private pending: Promise<void>[] = [];
  constructor(private readonly enqueue: (text: string) => Promise<void>) {}
  plain(): void {}
  info(): void {}
  dim(): void {}
  heading(): void {}
  warn(text: string): void { this.pending.push(this.enqueue(text)); }
  error(text: string): void { this.pending.push(this.enqueue(text)); }
  interrupt(text: string): void { this.pending.push(this.enqueue(text)); }
  async flush(): Promise<void> { await Promise.all(this.pending.splice(0)); }
}
