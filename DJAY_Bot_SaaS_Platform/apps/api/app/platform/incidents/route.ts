import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const statusSchema = z.enum(["open", "investigating", "monitoring", "resolved"]);
const querySchema = z.object({ tenantId: z.uuid().optional(), status: statusSchema.optional() }).strict();
const commandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("open"), tenantId: z.uuid(),
    category: z.enum(["provisioning", "onboarding", "deployment", "usage", "billing", "provider", "queue", "support", "privacy", "security", "other"]),
    severity: z.enum(["minor", "major", "critical"]),
    affectedProduct: z.enum(["platform", "flowbot", "ai_chat", "voice"]),
    summary: z.string().trim().min(12).max(500),
    idempotencyKey: z.uuid(),
  }).strict(),
  z.object({
    command: z.literal("transition"), incidentId: z.uuid(),
    status: z.enum(["investigating", "monitoring", "resolved"]),
    note: z.string().trim().min(12).max(1000),
  }).strict(),
  z.object({
    command: z.literal("assign"), incidentId: z.uuid(), ownerPlatformUserId: z.uuid(),
    note: z.string().trim().min(12).max(1000),
  }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.incidents.read")) return safeJson({ status: "not_found" }, 404);
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return safeJson({ status: "validation_failed" }, 400);
  try {
    const filters = {
      ...(parsed.data.tenantId ? { tenantId: parsed.data.tenantId } : {}),
      ...(parsed.data.status ? { status: parsed.data.status } : {}),
    };
    return safeJson({ board: await resolved.services.platformSupport.incidentBoard(resolved.context, filters) });
  } catch {
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.incidents.manage") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = commandSchema.parse(await readJson(request));
    const result = input.command === "open"
      ? await resolved.services.platformSupport.openIncident(resolved.context, input)
      : input.command === "transition"
        ? await resolved.services.platformSupport.transitionIncident(resolved.context, input)
        : await resolved.services.platformSupport.assignIncident(resolved.context, input);
    return safeJson(result);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    const message = error instanceof Error ? error.message : "";
    if (/not_found/.test(message)) return safeJson({ status: "not_found" }, 404);
    if (/(transition_not_allowed|assignment_not_allowed|idempotency_conflict)/.test(message)) return safeJson({ status: "conflict" }, 409);
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
