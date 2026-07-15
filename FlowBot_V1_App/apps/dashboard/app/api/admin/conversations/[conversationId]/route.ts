import { z } from "zod";
import { apiError, apiJson } from "../../../../../lib/api";
import { crmStatuses, getDashboardConversation, softDeleteDashboardConversation, updateDashboardConversation } from "../../../../../lib/admin-crm";
import { requireAdmin } from "../../../../../lib/require-admin";

const querySchema = z.object({
  afterSequence: z.string().regex(/^\d+$/).optional()
});

const patchSchema = z.object({
  crmStatus: z.enum(crmStatuses).optional(),
  starred: z.boolean().optional(),
  archived: z.boolean().optional(),
  customerId: z.string().uuid().nullable().optional()
});

export async function GET(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const query = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!query.success) return apiError("VALIDATION", "Invalid query.", 422);

  const response = await getDashboardConversation(admin, conversationId);
  if (!response) return apiError("NOT_FOUND", "Conversation not found.", 404);
  return apiJson(response);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const body = patchSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return apiError("VALIDATION", "Invalid conversation update.", 422, body.error.flatten());

  const response = await updateDashboardConversation(admin, conversationId, body.data);
  if (!response) return apiError("NOT_FOUND", "Conversation not found.", 404);
  return apiJson({ conversation: response });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ conversationId: string }> }) {
  const admin = await requireAdmin();
  if (!admin) return apiError("UNAUTHORIZED", "Authentication required.", 401);
  const { conversationId } = await params;
  const response = await softDeleteDashboardConversation(admin, conversationId);
  if (!response) return apiError("NOT_FOUND", "Conversation not found.", 404);
  return apiJson({ deleted: true });
}
