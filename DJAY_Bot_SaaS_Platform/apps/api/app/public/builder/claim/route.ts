import { hashOpaqueToken } from "@djay/auth";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { authCookieNames } from "../../../../lib/auth-cookies";
import { getServices } from "../../../../lib/container";
import { hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

const inputSchema = z.object({ token: z.string().min(32).max(256) }).strict();

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const sessionToken = request.cookies.get(authCookieNames.tenantSession)?.value;
  if (!sessionToken) return safeJson({ status: "not_found" }, 404);
  try {
    const input = inputSchema.parse(await readJson(request));
    const services = await getServices();
    const session = await services.session.current(sessionToken);
    if (!session?.selectedTenantId) return safeJson({ status: "workspace_required" }, 409);
    const workspace = session.workspaces.find((item) => item.tenantId === session.selectedTenantId);
    if (!workspace || !tenantRoleAllows(workspace.role, "onboarding.update")) {
      return safeJson({ status: "not_found" }, 404);
    }
    const result = await services.anonymousBuilder.claimExistingAccountDraft({
      tokenHash: hashOpaqueToken(input.token),
      tenantId: workspace.tenantId,
      userId: session.userId,
      membershipId: workspace.membershipId,
      requestId: requestId(),
    });
    return result.status === "unavailable" ? safeJson(result, 404) : safeJson(result, 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "not_found" }, 404);
    console.error("existing_account_builder_claim_failed", { reason: error instanceof Error ? error.name : "unknown" });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
