import type { AgentCallbacks } from "../agent/types.js";

// Weixin intentionally emits only the last assistant reply after the entire turn settles.
export class WeixinFinalReplyDisplay {
  readonly callbacks: AgentCallbacks;
  private assistant = "";
  private delta = "";
  private typingHandle: NodeJS.Timeout | undefined;
  private typingTasks: Promise<void>[] = [];
  private sent = false;

  constructor(private readonly options: { userId: string; sendTyping: () => Promise<void>; enqueueFinal: (text: string) => Promise<void>; typingIntervalMs: number }) {
    const activity = () => this.ensureTyping();
    this.callbacks = {
      onModelWaitStart: activity,
      onStatus: activity,
      onReasoningDelta: activity,
      onReasoning: activity,
      onAssistantDelta: (text) => { activity(); this.delta += text; },
      onAssistantText: (text) => { activity(); this.assistant = text; this.delta = ""; },
      onAssistantDone: (text) => { activity(); this.assistant = text || this.delta; this.delta = ""; },
      onToolCall: () => { activity(); this.assistant = ""; this.delta = ""; },
      onToolResult: activity,
      onToolError: activity,
    };
  }

  noteTerminalState(): void { this.assistant = ""; this.delta = ""; }
  async flush(): Promise<void> {
    this.dispose();
    const final = this.assistant || this.delta;
    if (final && !this.sent) { this.sent = true; await this.options.enqueueFinal(final); }
    await Promise.all(this.typingTasks);
  }
  dispose(): void { if (this.typingHandle) clearInterval(this.typingHandle); this.typingHandle = undefined; }
  private ensureTyping(): void {
    if (this.typingHandle) return;
    this.typingTasks.push(this.options.sendTyping().catch(() => undefined));
    this.typingHandle = setInterval(() => { this.typingTasks.push(this.options.sendTyping().catch(() => undefined)); }, this.options.typingIntervalMs);
    this.typingHandle.unref();
  }
}
