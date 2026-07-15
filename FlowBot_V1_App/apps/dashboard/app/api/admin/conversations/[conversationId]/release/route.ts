import { apiError, apiJson } from "../../../../../../lib/api";
import { releaseConversation } from "../../../../../../lib/flowbot-runtime";
import { requireAdmin } from "../../../../../../lib/require-admin";

export async function POST(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const response = await releaseConversation(admin, conversationId);
  if (!response) return apiError("CONFLICT", "Conversation is not in admin takeover.", 409);
  return apiJson(response);
}
