import { openJson } from "@djay/auth";
import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const requestSchema = z.object({
  name: z.string().trim().min(2).max(160),
  endpoint: z.url().transform((value, context) => {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443") || url.hostname === "localhost") {
      context.addIssue({ code: "custom", message: "A public HTTPS endpoint is required." });
      return z.NEVER;
    }
    return url.toString();
  }),
  allowedTemplateKeys: z.array(z.string().regex(/^[a-z][a-z0-9_.-]{1,99}$/)).min(1).max(20),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.read")) return safeJson({ status: "not_found" }, 404);
  const key = resolved.services.flowbotIntegrationEnvelopeKey;
  if (!key) return safeJson({ status: "not_available" }, 503);
  const profiles = await resolved.services.tenantFlowbotIntegrations.list(resolved.context);
  return safeJson({ integrations: profiles.map(({ endpointCiphertext, ...profile }) => ({
    ...profile, endpoint: openJson<{ url: string }>(endpointCiphertext, key).url,
  })) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "flowbot.deploy") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const key = resolved.services.flowbotIntegrationEnvelopeKey;
  if (!key) return safeJson({ status: "not_available" }, 503);
  try {
    const body = requestSchema.parse(await readJson(request));
    const result = await resolved.services.tenantFlowbotIntegrations.request(resolved.context, { ...body, envelopeKey: key });
    return safeJson(result, result.status === "requested" ? 201 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "not_available" }, 503);
  }
}
