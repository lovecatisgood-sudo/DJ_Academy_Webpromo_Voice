import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";
import { z, ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, safeJson } from "../../../../lib/http";

const requestSchema = z.object({
  sourceLanguage: z.enum(["en", "th"]),
  targetLanguage: z.enum(["en", "th"]),
  texts: z.array(z.string().trim().min(1).max(2_000)).min(1).max(60),
}).strict().refine((value) => value.sourceLanguage !== value.targetLanguage, "Languages must differ.");

const resultSchema = z.object({ translations: z.array(z.string().trim().min(1).max(2_000)) }).strict();
const outputSchema = z.toJSONSchema(resultSchema, { target: "draft-7" });

export async function POST(request: NextRequest) {
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit("public_builder_translate", clientAddress(request), 20, 60_000);
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429);
  try {
    const input = requestSchema.parse(await readJson(request, 130_000));
    const services = await getServices();
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
    if (parsed.translations.length !== input.texts.length) return safeJson({ status: "invalid_translation" }, 502);
    return safeJson({ status: "completed", translations: parsed.translations });
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    console.error("public_builder_translation_failed", { reason: error instanceof Error ? error.message : "unknown_error" });
    return safeJson({ status: "temporarily_unavailable" }, 503);
  }
}
