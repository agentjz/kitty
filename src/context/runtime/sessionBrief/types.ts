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
  userAnchors: string[];
  recentUserInputs: string[];
  toolActivity: string[];
  currentThread?: string;
  updatedAt: string;
}
