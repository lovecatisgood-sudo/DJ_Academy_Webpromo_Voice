import { z } from "zod";
import { apiError, apiJson } from "../../../../../../lib/api";
import { adminReply } from "../../../../../../lib/flowbot-runtime";
import { requireAdmin } from "../../../../../../lib/require-admin";

const bodySchema = z.object({
  idempotencyKey: z.string().uuid(),
  text: z.string().min(1).max(2000)
});

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError("VALIDATION", "Invalid reply request.", 422);

  const message = await adminReply({ admin, conversationId, ...parsed.data });
  if (!message) return apiError("CONFLICT", "Conversation is not in admin takeover.", 409);
  return apiJson({ message });
}
