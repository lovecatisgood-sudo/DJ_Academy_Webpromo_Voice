import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { getServices } from "../../../../lib/container";
import { readJson, requestId, safeJson } from "../../../../lib/http";

const operationalServiceKeys = [
  "public_site", "tenant_api", "flowbot_runtime", "ai_chat_runtime",
  "social_delivery", "voice_gateway", "worker",
] as const;
const operationalAttestationKinds = [
  "on_call", "restore", "support_runbook", "security_review", "privacy_review",
  "event_replay", "queue_recovery", "pool_exhaustion",
] as const;

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const reference = z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{7,199}$/);
const observation = z.object({
  kind: z.literal("observation"),
  environment: z.enum(["staging", "production"]),
  serviceKey: z.enum(operationalServiceKeys),
  windowStart: z.iso.datetime(), windowEnd: z.iso.datetime(),
  sampleCount: z.number().int().positive().max(1_000_000_000),
  successfulCount: z.number().int().nonnegative().max(1_000_000_000),
  latencyP95Ms: z.number().int().nonnegative().max(300_000),
  queueAgeSeconds: z.number().int().nonnegative().max(604_800).nullable(),
  deadLetterCount: z.number().int().nonnegative().max(1_000_000_000),
  evidenceSha256: digest, sourceReference: reference,
}).strict().superRefine((value, context) => {
  if (value.successfulCount > value.sampleCount) {
    context.addIssue({ code: "custom", path: ["successfulCount"], message: "exceeds sample count" });
  }
  if (new Date(value.windowEnd) <= new Date(value.windowStart)) {
    context.addIssue({ code: "custom", path: ["windowEnd"], message: "must follow window start" });
  }
});
const attestation = z.object({
  kind: z.literal("attestation"),
  environment: z.enum(["staging", "production"]),
  attestationKind: z.enum(operationalAttestationKinds),
  status: z.enum(["passed", "failed"]),
  validFrom: z.iso.datetime(), validUntil: z.iso.datetime(),
  evidenceSha256: digest, sourceReference: reference,
}).strict().superRefine((value, context) => {
  if (new Date(value.validUntil) <= new Date(value.validFrom)) {
    context.addIssue({ code: "custom", path: ["validUntil"], message: "must follow valid from" });
  }
});
const inputSchema = z.discriminatedUnion("kind", [observation, attestation]);

function authorized(request: NextRequest, expected: string | undefined) {
  const header = request.headers.get("authorization");
  const supplied = header?.startsWith("Bearer ") ? header.slice(7) : "";
  if (!expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

export async function POST(request: NextRequest) {
  const services = await getServices();
  if (!authorized(request, services.env.OPERATIONS_INGEST_TOKEN)) {
    return safeJson({ status: "not_found" }, 404);
  }
  try {
    const input = inputSchema.parse(await readJson(request, 5_000));
    const now = new Date();
    const common = {
      environment: input.environment,
      evidenceSha256: Buffer.from(input.evidenceSha256, "hex"),
      sourceReference: input.sourceReference,
      requestId: requestId(), now,
    };
    const result = input.kind === "observation"
      ? await services.platformOperations.ingestObservation({
        ...common, serviceKey: input.serviceKey,
        windowStart: new Date(input.windowStart), windowEnd: new Date(input.windowEnd),
        sampleCount: input.sampleCount, successfulCount: input.successfulCount,
        latencyP95Ms: input.latencyP95Ms, queueAgeSeconds: input.queueAgeSeconds,
        deadLetterCount: input.deadLetterCount,
      })
      : await services.platformOperations.ingestAttestation({
        ...common, attestationKind: input.attestationKind, status: input.status,
        validFrom: new Date(input.validFrom), validUntil: new Date(input.validUntil),
      });
    return safeJson(result, result.status === "recorded" ? 201 : 200);
  } catch (error) {
    return error instanceof z.ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "conflict" }, 409);
  }
}
