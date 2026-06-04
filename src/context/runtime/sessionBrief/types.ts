export interface SessionConversationBrief {
  version: 1;
  modelSummary?: string;
  modelSummaryUpdatedAt?: string;
  userTurnCount: number;
  assistantTurnCount: number;
  toolActivity: string[];
  updatedAt: string;
}
