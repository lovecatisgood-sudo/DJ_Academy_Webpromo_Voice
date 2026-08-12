import { randomUUID } from "node:crypto";
import { tenantRoleAllows } from "@djay/authorization";
import { publicFlowInputSchema } from "@djay/flowbot-domain";
import { uuidSchema } from "@djay/shared";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../../../lib/http";
import { resolveTenantRequest } from "../../../../../../lib/tenant-context";

const previewSchema = z.object({
  language: z.enum(["th", "en"]),
  inputs: z.array(publicFlowInputSchema).max(30).default([]),
  startNodeId: z.uuid().optional(),
  businessOpen: z.boolean().default(true),
}).strict();

export async function POST(request: NextRequest, route: { params: Promise<{ botId: string }> }) {
  const resolved = await resolveTenantRequest(request);
  const botId = uuidSchema.safeParse((await route.params).botId);
  if (!resolved || !botId.success || !tenantRoleAllows(resolved.context.role, "flowbot.author") || !(await hasTrustedOrigin(request))) {
    return safeJson({ status: "not_found" }, 404);
  }
  const allowed = await enforceRateLimit(
    "flowbot_draft_preview", `${resolved.context.tenantId}:${clientAddress(request)}`, 30, 60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  try {
    const input = previewSchema.parse(await readJson(request, 80_000));
    const result = await resolved.services.flowbot.previewDraft(resolved.context, botId.data, {
      language: input.language, inputs: input.inputs, businessOpen: input.businessOpen,
      ...(input.startNodeId ? { startNodeId: input.startNodeId } : {}),
    });
    if (result.status === "previewed" && result.publishedVersionId && !input.startNodeId) {
      await resolved.services.tenantBotRegression.record(resolved.context, {
        productKey: "flowbot", subjectId: botId.data, artifactVersionId: result.publishedVersionId,
        suiteKey: input.inputs.length ? "merchant_scenario" : "published_smoke", locale: input.language,
        checks: {
          production_engine_completed: true,
          external_side_effects_suppressed: result.preview.turns.every((turn) => Array.isArray(turn.commands)),
          traversal_trace_available: result.preview.turns.every((turn) => Array.isArray(turn.trace)),
        },
        idempotencyKey: randomUUID(),
      });
    }
    return safeJson(result, result.status === "previewed" ? 200
      : result.status === "not_found" ? 404
        : result.status === "validation_failed" ? 422 : 403);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ status: "validation_failed" }, 400)
      : safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
