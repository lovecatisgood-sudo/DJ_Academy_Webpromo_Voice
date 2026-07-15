import { z } from "zod";
import { addConversationNote } from "../../../../../../lib/admin-crm";
import { apiError, apiJson } from "../../../../../../lib/api";
import { requireAdmin } from "../../../../../../lib/require-admin";

const noteSchema = z.object({
  note: z.string().trim().min(1).max(2000)
});

export async function POST(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const body = noteSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid note.", 422, body.error.flatten());

  const note = await addConversationNote(admin, conversationId, body.data.note);
  if (!note) return apiError("NOT_FOUND", "Conversation not found.", 404);
  return apiJson({ note }, 201);
}
