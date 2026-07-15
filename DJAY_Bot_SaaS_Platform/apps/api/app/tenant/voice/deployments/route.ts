import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolveTenantRequest } from "../../../../lib/tenant-context";

const schema = z.object({
  name: z.string().trim().min(2).max(160),
  agentName: z.string().trim().min(2).max(100),
  businessName: z.string().trim().min(2).max(200),
  allowedOrigins: z.array(z.string().max(2048)).min(1).max(20),
  defaultLocale: z.enum(["th", "en"]),
  greetingTh: z.string().trim().min(1).max(1000), greetingEn: z.string().trim().min(1).max(1000),
  automatedDisclosureTh: z.string().trim().min(8).max(500),
  automatedDisclosureEn: z.string().trim().min(8).max(500),
  maxCallSeconds: z.number().int().min(30).max(14_400),
  reconnectWindowSeconds: z.number().int().min(0).max(300),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson(await resolved.services.voiceDeployments.list(resolved.context));
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "voice.deploy") || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  try {
    const result = await resolved.services.voiceDeployments.create(resolved.context, schema.parse(await readJson(request)));
    return safeJson(result, result.status === "created" ? 201 : result.status === "not_entitled" ? 403 : 400);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
