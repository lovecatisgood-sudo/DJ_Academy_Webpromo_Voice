import { z } from "zod";
import type { NextRequest } from "next/server";
import { uuidSchema } from "@djay/shared";
import { safeJson } from "../../../../../lib/http";
import { withTenantMutation } from "../../../../../lib/tenant-mutation";

const bodySchema = z.object({
  legalHold: z.boolean(),
  reason: z.string().trim().min(8).max(500).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.legalHold && !value.reason) {
    ctx.addIssue({ code: "custom", message: "reason_required", path: ["reason"] });
  }
});

export async function POST(
  request: NextRequest,
  route: { params: Promise<{ conversationId: string }> },
) {
  const parsedId = uuidSchema.safeParse((await route.params).conversationId);
  if (!parsedId.success) return safeJson({ status: "not_found" }, 404);

  return withTenantMutation(
    request,
    {
      permission: "privacy.manage",
      assurance: "recent_auth",
      rateLimit: { scope: "tenant-legal-hold", limit: 40, windowMs: 15 * 60 * 1000 },
      bodySchema,
    },
    async (resolved) => {
      const result = await resolved.services.sharedDomain.setConversationLegalHold(
        resolved.context,
        parsedId.data,
        {
          legalHold: resolved.body.legalHold,
          ...(resolved.body.reason !== undefined ? { reason: resolved.body.reason } : {}),
        },
      );
      if (result.status === "validation_failed") {
        return safeJson({ status: "validation_failed" }, 400);
      }
      return safeJson(result, result.status === "accepted" ? 200 : 404);
    },
  );
}
