import { tenantRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../lib/tenant-context";

const valueSchema = z.object({
  leadId: z.uuid(), conversationId: z.uuid().optional(),
  amountMinor: z.number().int().min(1).max(9_000_000_000_000_000),
  currency: z.string().regex(/^[A-Z]{3}$/),
  idempotencyKey: z.uuid(),
}).strict();

export async function GET(request: NextRequest, context: { params: Promise<{ contactId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "contacts.read")) return safeJson({ status: "not_found" }, 404);
  const contactId = z.string().uuid().safeParse((await context.params).contactId);
  if (!contactId.success) return safeJson({ status: "not_found" }, 404);
  const journey = await resolved.services.sharedDomain.getCustomerJourney(resolved.context, contactId.data);
  return journey ? safeJson({ journey }) : safeJson({ status: "not_found" }, 404);
}

export async function POST(request: NextRequest, context: { params: Promise<{ contactId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  if (!resolved || !tenantRoleAllows(resolved.context.role, "leads.write") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const contactId = z.string().uuid().parse((await context.params).contactId);
    const input = valueSchema.parse(await readJson(request));
    const result = await resolved.services.sharedDomain.recordCustomerDealValue(resolved.context, {
      contactId, leadId: input.leadId, amountMinor: input.amountMinor, currency: input.currency,
      idempotencyKey: input.idempotencyKey,
      ...(input.conversationId ? { conversationId: input.conversationId } : {}),
    });
    return safeJson(result, result.status === "recorded" ? 201 : 409);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
