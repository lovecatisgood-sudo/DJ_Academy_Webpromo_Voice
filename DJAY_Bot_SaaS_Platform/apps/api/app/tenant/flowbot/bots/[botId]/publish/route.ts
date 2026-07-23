import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../../../../lib/http";
import { withTenantMutation } from "../../../../../../lib/tenant-mutation";

export async function POST(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const botId = uuidSchema.safeParse((await route.params).botId);
  if (!botId.success) return safeJson({ status: "not_found" }, 404);
  return withTenantMutation(
    request,
    {
      permission: "flowbot.publish",
      assurance: "none",
      rateLimit: { scope: "tenant-flowbot-publish", limit: 30, windowMs: 15 * 60 * 1000 },
      emptyBody: true,
    },
    async (resolved) => {
      const result = await resolved.services.flowbot.publish(resolved.context, botId.data);
      return safeJson(
        result,
        result.status === "published" ? 200 : result.status === "validation_failed" ? 422 : 403,
      );
    },
  );
}
