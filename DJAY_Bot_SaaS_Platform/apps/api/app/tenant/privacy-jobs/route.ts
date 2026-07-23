import { tenantRoleAllows } from "@djay/authorization";
import { privacyJobRequestSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";
import { withTenantMutation } from "../../../lib/tenant-mutation";

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "privacy.manage")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ jobs: await resolved.services.sharedDomain.listPrivacyJobs(resolved.context) });
}

export async function POST(request: NextRequest) {
  return withTenantMutation(
    request,
    {
      permission: "privacy.manage",
      assurance: "recent_auth",
      rateLimit: { scope: "tenant-privacy-job", limit: 20, windowMs: 15 * 60 * 1000 },
      bodySchema: privacyJobRequestSchema,
    },
    async (resolved) => {
      try {
        const result = await resolved.services.sharedDomain.requestPrivacyJob(
          resolved.context,
          resolved.body,
        );
        return safeJson(result, result.status === "accepted" ? 202 : result.status === "conflict" ? 409 : 404);
      } catch {
        return safeJson({ status: "temporarily_unavailable" }, 503);
      }
    },
  );
}
