import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { safeJson } from "../../../../../../lib/http";
import { withTenantMutation } from "../../../../../../lib/tenant-mutation";

const trafficSchema = z.object({ action: z.enum(["go_live", "stop"]) }).strict();

export async function POST(request: NextRequest, route: { params: Promise<{ deploymentId: string }> }) {
  const deploymentId = uuidSchema.safeParse((await route.params).deploymentId);
  if (!deploymentId.success) return safeJson({ status: "not_found" }, 404);
  return withTenantMutation(
    request,
    {
      permission: "ai_chat.deploy",
      rateLimit: { scope: "tenant-ai-chat-traffic", limit: 20, windowMs: 15 * 60 * 1000 },
      bodySchema: trafficSchema,
    },
    async (resolved) => {
      const result = await resolved.services.aiChat.changeDeploymentTraffic(
        resolved.context,
        deploymentId.data,
        resolved.body.action,
      );
      return safeJson(
        result,
        result.status === "updated" || result.status === "unchanged" ? 200
          : result.status === "verification_required" || result.status === "quota_unavailable" ? 409
            : result.status === "not_found" ? 404 : 403,
      );
    },
  );
}
