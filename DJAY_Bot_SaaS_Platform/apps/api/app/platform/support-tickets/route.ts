import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../lib/http";
import { resolvePlatformRequest } from "../../../lib/platform-context";

const responseSchema = z.object({
  ticketId: z.uuid(), body: z.string().trim().min(2).max(5000),
  status: z.enum(["open","in_progress","waiting_on_customer","resolved"]),
  idempotencyKey: z.uuid(),
}).strict();

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.support_tickets.read")) return safeJson({ status: "not_found" }, 404);
  return safeJson({ support: await resolved.services.platformSupportTickets.queue(resolved.context) });
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.support_tickets.manage") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const result = await resolved.services.platformSupportTickets.respond(resolved.context, responseSchema.parse(await readJson(request)));
    return safeJson(result, result.status === "updated" ? 200 : result.status === "idempotency_conflict" ? 409 : 404);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400) : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
