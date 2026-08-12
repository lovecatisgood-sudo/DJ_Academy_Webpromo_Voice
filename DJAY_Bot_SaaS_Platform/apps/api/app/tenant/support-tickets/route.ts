import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolveTenantRequest } from "../../../lib/tenant-context";

const createSchema = z.object({
  category: z.enum(["onboarding","channel","bot","knowledge","inbox","billing","account","other"]),
  priority: z.enum(["low","normal","high","urgent"]).default("normal"),
  subject: z.string().trim().min(5).max(160),
  description: z.string().trim().min(10).max(5000),
  contextPath: z.string().trim().startsWith("/").max(500).optional(),
  diagnosticCode: z.string().regex(/^[A-Z0-9][A-Z0-9_.-]{1,79}$/).optional(),
  idempotencyKey: z.uuid(),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "support.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ support: await resolved.services.tenantSupportTickets.overview(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "support.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const body = createSchema.parse(await readJson(request));
    const result = await resolved.services.tenantSupportTickets.createTicket(resolved.context, {
      category: body.category, priority: body.priority, subject: body.subject,
      description: body.description, idempotencyKey: body.idempotencyKey,
      ...(body.contextPath ? { contextPath: body.contextPath } : {}),
      ...(body.diagnosticCode ? { diagnosticCode: body.diagnosticCode } : {}),
    });
    return safeJson(result, result.status === "created" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
