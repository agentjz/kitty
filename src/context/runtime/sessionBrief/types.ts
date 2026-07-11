export interface SessionConversationBrief {
  modelSummary?: string;
  modelSummaryUpdatedAt?: string;
  userTurnCount: number;
  assistantTurnCount: number;
  toolActivity: string[];
  updatedAt: string;
}
