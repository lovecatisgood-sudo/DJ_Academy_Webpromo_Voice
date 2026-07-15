import { analyzeAndPersistConversation } from "./conversation-post-analysis";
import type { Settings } from "./types";

export function scheduleConversationAnalysis(conversationId: string, settings?: Settings) {
  void analyzeAndPersistConversation(conversationId, { settings })
    .catch((error) => {
      console.error("Scheduled conversation analysis failed", {
        conversationId,
        error: error instanceof Error ? error.message : String(error),
      });
    });
}
