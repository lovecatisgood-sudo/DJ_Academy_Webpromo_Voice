import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

type RouteContext = Readonly<{ params: Promise<{ ticketId: string }> }>;
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("reply"), body: z.string().trim().min(2).max(5000), idempotencyKey: z.uuid() }).strict(),
  z.object({ action: z.literal("close"), rating: z.number().int().min(1).max(5).optional(), comment: z.string().trim().min(2).max(1000).optional() })
    .strict().refine((value) => !value.comment || value.rating !== undefined, { message: "rating_required" }),
  z.object({ action: z.literal("read_notification"), notificationId: z.uuid() }).strict(),
]);

export async function POST(request: NextRequest, route: RouteContext) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "support.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const { ticketId } = await route.params;
    const parsedId = z.uuid().parse(ticketId);
    const body = actionSchema.parse(await readJson(request));
    const result = body.action === "close"
      ? await resolved.services.tenantSupportTickets.closeTicket(resolved.context, parsedId,
        body.rating ? { rating: body.rating, ...(body.comment ? { comment: body.comment } : {}) } : undefined)
      : body.action === "read_notification"
        ? await resolved.services.tenantSupportTickets.markNotificationRead(resolved.context, parsedId, body.notificationId)
        : await resolved.services.tenantSupportTickets.addMessage(resolved.context, { ticketId: parsedId, body: body.body, idempotencyKey: body.idempotencyKey });
    return safeJson(result, result.status === "not_found" ? 404 : result.status === "idempotency_conflict" ? 409 : result.status === "ticket_closed" ? 400 : 200);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
