import { tenantRoleAllows } from "@djay/authorization";
import { lineAutoReplyBlocksBot, LineChannelError } from "@djay/channel-adapters";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { hasSensitiveTenantAssurance } from "../../../../../../lib/tenant-assurance";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const previewSchema = z.object({
  channelId: z.string().trim().min(3).max(200),
  channelSecret: z.string().min(16).max(4096),
}).strict();

/**
 * Read-only identity probe so the merchant confirms the right Official Account *before*
 * anything is created (design spec 5.2). Mints a short-lived token, reads
 * `GET /v2/bot/info`, persists nothing, and returns only public display metadata —
 * never the token, never the secret.
 */
export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "integrations.manage")
    || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (!hasSensitiveTenantAssurance(resolved.session)) return safeJson({ status: "reauthentication_required" }, 403);
  try {
    const input = previewSchema.parse(await readJson(request));
    const token = await resolved.services.lineChannel.mintChannelToken(input);
    const info = await resolved.services.lineChannel.getBotInfo(token.accessToken);
    return safeJson({
      status: "verified",
      bot: {
        userId: info.userId, basicId: info.basicId, displayName: info.displayName,
        pictureUrl: info.pictureUrl ?? null, chatMode: info.chatMode,
      },
      autoReplyBlocksBot: lineAutoReplyBlocksBot(info),
    }, 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    if (error instanceof LineChannelError) {
      const reason = error.code === "line_credentials_invalid" || error.code === "line_authorization_failed"
        ? "invalid_credentials" : error.code === "line_rate_limited" ? "line_rate_limited"
          : error.code === "line_transport_failed" ? "line_unreachable" : "bot_info_unavailable";
      return safeJson({ status: "connect_failed", step: "mint", reason, statusCode: null },
        reason === "invalid_credentials" ? 422 : reason === "line_rate_limited" ? 429 : 503);
    }
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
