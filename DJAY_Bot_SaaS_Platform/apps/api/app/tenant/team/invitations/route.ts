import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { safeJson } from "../../../../lib/http";
import { withTenantMutation } from "../../../../lib/tenant-mutation";

const invitationBodySchema = z.object({
  email: z.string().email().max(320),
  role: z.enum([
    "tenant_admin",
    "tenant_operator",
    "tenant_conversation_manager",
    "tenant_human_agent",
    "tenant_analyst",
    "tenant_billing_manager",
  ]),
}).strict();

export async function POST(request: NextRequest) {
  return withTenantMutation(
    request,
    {
      permission: "team.invite",
      assurance: "none",
      rateLimit: { scope: "tenant-invitation", limit: 30, windowMs: 60 * 60 * 1000 },
      bodySchema: invitationBodySchema,
    },
    async (resolved) => {
      try {
        const result = await resolved.services.invitations.invite(resolved.context, {
          email: resolved.body.email,
          role: resolved.body.role,
          requestId: resolved.context.requestId,
        });
        if (result.status === "not_found") return safeJson({ status: "not_found" }, 404);
        if (result.status === "seat_limit_reached") return safeJson({ status: result.status }, 409);
        return safeJson({ status: result.status }, result.status === "created" ? 201 : 202);
      } catch (error) {
        return error instanceof ZodError || error instanceof SyntaxError
          ? safeJson({ status: "validation_failed" }, 400)
          : safeJson({ status: "temporarily_unavailable" }, 503);
      }
    },
  );
}
