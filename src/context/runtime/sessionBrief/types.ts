export interface SessionConversationBrief {
  userTurnCount: number;
  assistantTurnCount: number;
  toolActivity: string[];
  updatedAt: string;
}
