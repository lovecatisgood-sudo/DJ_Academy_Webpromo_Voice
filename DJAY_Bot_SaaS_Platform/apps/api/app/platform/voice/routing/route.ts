import { platformRoleAllows } from "@djay/authorization";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { resolvePlatformRequest } from "../../../../lib/platform-context";

const assuranceWindowMs = 10 * 60 * 1_000;
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const commandSchema = z.discriminatedUnion("command", [
  z.object({
    command: z.literal("candidate.propose"), capabilityProfile: z.literal("voice_gen2"),
    providerKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
    modelKey: z.string().trim().min(2).max(160),
    regionKey: z.string().trim().regex(/^[a-z0-9][a-z0-9._-]{1,79}$/),
  }).strict(),
  z.object({ command: z.literal("candidate.review"), candidateId: z.uuid(), decision: z.enum(["qualify", "reject"]), evidenceSha256: digest }).strict(),
  z.object({ command: z.literal("change.request"), capabilityProfile: z.literal("voice_gen2"), candidateId: z.uuid(), canaryPercent: z.number().int().min(1).max(100), reason: z.string().trim().min(12).max(500), evidenceSha256: digest }).strict(),
  z.object({ command: z.literal("change.review"), changeId: z.uuid(), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ command: z.literal("change.apply"), changeId: z.uuid(), action: z.enum(["start_canary", "promote", "rollback"]), reason: z.string().trim().min(12).max(500) }).strict(),
  z.object({ command: z.literal("admission.request"), enabled: z.boolean(), reason: z.string().trim().min(12).max(500), evidenceSha256: digest }).strict(),
  z.object({ command: z.literal("admission.review"), changeId: z.uuid(), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ command: z.literal("admission.apply"), changeId: z.uuid() }).strict(),
  z.object({ command: z.literal("incident.open"), capabilityProfile: z.literal("voice_gen2"), severity: z.enum(["minor", "major", "critical"]), reason: z.string().trim().min(12).max(1000), routingChangeId: z.uuid().nullable(), creditReviewRequired: z.boolean() }).strict(),
  z.object({ command: z.literal("incident.credit_review"), incidentId: z.uuid(), decision: z.enum(["approve", "reject"]) }).strict(),
  z.object({ command: z.literal("incident.resolve"), incidentId: z.uuid(), resolution: z.string().trim().min(12).max(2000) }).strict(),
]);

export async function GET(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !platformRoleAllows(resolved.context.role, "platform.routing.read")) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    return safeJson({ routing: await resolved.services.platformVoiceOperations.getRoutingOverview(resolved.context) });
  } catch {
    return safeJson({ status: "not_found" }, 404);
  }
}

export async function POST(request: NextRequest) {
  const resolved = await resolvePlatformRequest(request);
  if (!resolved || !(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  if (Date.now() - resolved.session.reauthenticatedAt.getTime() > assuranceWindowMs) {
    return safeJson({ status: "reauthentication_required" }, 403);
  }
  try {
    const body = await readJson(request, 5_000);
    const command = typeof body === "object" && body !== null && "command" in body
      ? (body as { command?: unknown }).command
      : undefined;
    const permission = command === "incident.credit_review"
      ? "platform.billing.manage" as const
      : "platform.routing.change" as const;
    if (!platformRoleAllows(resolved.context.role, permission)) {
      return safeJson({ status: "not_found" }, 404);
    }
    const input = commandSchema.parse(body);
    const store = resolved.services.platformVoiceOperations;
    const result = input.command === "candidate.propose" ? await store.proposeRouteCandidate(resolved.context, input)
      : input.command === "candidate.review" ? await store.reviewRouteCandidate(resolved.context, input)
        : input.command === "change.request" ? await store.requestRoutingChange(resolved.context, input)
          : input.command === "change.review" ? await store.reviewRoutingChange(resolved.context, input)
            : input.command === "change.apply" ? await store.applyRoutingChange(resolved.context, input)
              : input.command === "admission.request" ? await store.requestAdmissionChange(resolved.context, input)
                : input.command === "admission.review" ? await store.reviewAdmissionChange(resolved.context, input)
                  : input.command === "admission.apply" ? await store.applyAdmissionChange(resolved.context, input)
                    : input.command === "incident.open" ? await store.openIncident(resolved.context, input)
                      : input.command === "incident.credit_review" ? await store.reviewIncidentCredit(resolved.context, input)
                        : await store.resolveIncident(resolved.context, input);
    return safeJson(result);
  } catch (error) {
    return error instanceof z.ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "conflict" }, 409);
  }
}
