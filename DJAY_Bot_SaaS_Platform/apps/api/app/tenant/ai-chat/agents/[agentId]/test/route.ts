import { runAiTextPreview } from "@djay/ai-chat-runtime";
import { tenantRoleAllows } from "@djay/authorization";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const testSchema = z.object({
  inputId: z.uuid(),
  language: z.enum(["th", "en"]),
  message: z.string().trim().min(1).max(2000),
}).strict();

export async function POST(request: NextRequest, route: { params: Promise<{ agentId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const agentId = uuidSchema.safeParse((await route.params).agentId);
  if (!resolved || !agentId.success || !tenantRoleAllows(resolved.context.role, "ai_chat.author") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!resolved.services.aiTextGateway) return safeJson({ status: "not_available" }, 503);
  const allowed = await enforceRateLimit(
    "ai_chat_test_mode", `${resolved.context.tenantId}:${clientAddress(request)}`, 20, 60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  try {
    const body = testSchema.parse(await readJson(request, 8_000));
    const testContext = await resolved.services.aiChat.getTestContext(resolved.context, agentId.data);
    if (!testContext) return safeJson({ status: "not_found" }, 404);
    const preview = await runAiTextPreview({ gateway: resolved.services.aiTextGateway, ...testContext, ...body });
    return safeJson({ preview });
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
