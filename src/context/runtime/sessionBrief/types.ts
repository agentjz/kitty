export interface SessionBriefTurn {
  role: "user" | "assistant";
  text: string;
  toolNames?: string[];
}

export interface SessionConversationBrief {
  version: 1;
  modelSummary?: string;
  modelSummaryUpdatedAt?: string;
  userTurnCount: number;
  assistantTurnCount: number;
  omittedLongTurnCount: number;
  anchorTurns: SessionBriefTurn[];
  recentTurns: SessionBriefTurn[];
  toolActivity: string[];
  currentThread?: string;
  updatedAt: string;
}
