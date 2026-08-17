import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { publicBuilderDraftStrings } from "../../../../lib/public-builder-draft-context";
import { enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";
import { PUBLIC_BUILDER_TEST_COOKIE, publicBuilderTestCookie, resolvePublicBuilderTestSession } from "../../../../lib/public-builder-test-quota";

const requestSchema = z.object({
  sourceLanguage: z.enum(["en", "th"]),
  targetLanguage: z.enum(["en", "th"]),
  draftRevision: z.number().int().min(1),
  texts: z.array(z.string().trim().min(1).max(2_000)).min(1).max(60),
}).strict().refine((value) => value.sourceLanguage !== value.targetLanguage, "Languages must differ.");

const resultSchema = z.object({ translations: z.array(z.string().trim().min(1).max(2_000)) }).strict();
const outputSchema = z.toJSONSchema(resultSchema, { target: "draft-7" });

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  let headers: HeadersInit | undefined;
  try {
    const input = requestSchema.parse(await readJson(request, 130_000));
    const services = await getServices();
    const session = resolvePublicBuilderTestSession(request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value, services.rateLimitKey);
    headers = { "Set-Cookie": publicBuilderTestCookie(session.cookieValue, services.env.NODE_ENV === "production") };
    const draft = await services.anonymousBuilder.ensureDraft(session);
    if (!draft || draft.revision !== input.draftRevision) return safeJson({ status: "draft_revision_changed" }, 409, headers);
    const draftStrings = publicBuilderDraftStrings(draft.state);
    if (input.texts.some((text) => !draftStrings.has(text))) return safeJson({ status: "source_not_in_saved_draft" }, 409, headers);
    const allowed = await enforceRateLimit("public_builder_translate", session.sessionId, 20, 60_000);
    if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, headers);
    if (!services.aiTextGateway) return safeJson({ status: "not_available" }, 503);
    const languageName = input.targetLanguage === "th" ? "Thai" : "English";
    const result = await services.aiTextGateway.generate({
      correlationId: randomUUID(),
      locale: input.targetLanguage,
      systemPolicy: `Translate every supplied customer-facing UI string into natural ${languageName}. Preserve names, URLs, numbers, meaning, and tone. Do not add explanations. Return exactly one translation for each input in the same order.`,
      messages: [],
      customerMessage: JSON.stringify({ texts: input.texts }),
      structuredOutputSchemaVersion: "translation.v1",
      structuredOutputJsonSchema: outputSchema,
    });
    const parsed = resultSchema.parse(result.output);
    if (parsed.translations.length !== input.texts.length) return safeJson({ status: "invalid_translation" }, 502, headers);
    return safeJson({ status: "completed", translations: parsed.translations, draftRevision: draft.revision }, 200, headers);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400, headers);
    console.error("public_builder_translation_failed", { reason: error instanceof Error ? error.message : "unknown_error" });
    return safeJson({ status: "temporarily_unavailable" }, 503, headers);
  }
}
