export interface RemoteActiveTurn {
  controller: AbortController;
  sessionId: string;
}

export class RemoteTurnState<TActive extends RemoteActiveTurn> {
  private readonly activeTurns = new Map<string, TActive>();
  private readonly queuedTurnCounts = new Map<string, number>();

  getActiveTurn(peerKey: string): TActive | undefined { return this.activeTurns.get(peerKey); }
  setActiveTurn(peerKey: string, turn: TActive): void { this.activeTurns.set(peerKey, turn); }
  clearActiveTurn(peerKey: string): void { this.activeTurns.delete(peerKey); }
  getQueuedTurnCount(peerKey: string): number { return this.queuedTurnCounts.get(peerKey) ?? 0; }
  incrementQueuedTurns(peerKey: string): void { this.queuedTurnCounts.set(peerKey, this.getQueuedTurnCount(peerKey) + 1); }
  decrementQueuedTurns(peerKey: string): void {
    const count = Math.max(0, this.getQueuedTurnCount(peerKey) - 1);
    if (count === 0) this.queuedTurnCounts.delete(peerKey);
    else this.queuedTurnCounts.set(peerKey, count);
  }
  abortAllActiveTurns(reason: string): void {
    for (const turn of this.activeTurns.values()) if (!turn.controller.signal.aborted) turn.controller.abort(reason);
  }
  listActiveSessionIds(): string[] { return [...new Set([...this.activeTurns.values()].map((turn) => turn.sessionId))]; }
}
