import { apiError, apiJson } from "../../../../../../lib/api";
import { takeoverConversation } from "../../../../../../lib/flowbot-runtime";
import { requireAdmin } from "../../../../../../lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const state = await takeoverConversation(admin, conversationId);
  if (!state) return apiError("CONFLICT", "Conversation cannot be taken over.", 409);
  return apiJson({ state });
}
