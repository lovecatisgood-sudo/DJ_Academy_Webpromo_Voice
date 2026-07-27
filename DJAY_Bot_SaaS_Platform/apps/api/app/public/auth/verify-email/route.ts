import { verificationInputSchema } from "@djay/auth";
import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  let locale: "th" | "en" = "th";
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_or_expired" }, 400);
  try {
    const raw = await readJson(request);
    locale = typeof raw === "object" && raw !== null && "locale" in raw && raw.locale === "en" ? "en" : "th";
    const body = verificationInputSchema.parse({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      requestId: id,
    });
    const limit = await enforceRateLimit("verify-token", body.token.slice(0, 24), 10, 15 * 60 * 1000);
    if (!limit.allowed) return safeJson({ status: "invalid_or_expired" }, 400);
    const { registration } = await getServices();
    const result = await registration.verify(body);
    return result.status === "invalid_or_expired"
      ? safeJson({ status: result.status }, 400)
      : safeJson({ status: result.status }, 200);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "invalid_or_expired" }, 400);
    }
    console.error("verification_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: locale === "en" ? "Verification is unavailable." : "ระบบยืนยันอีเมลไม่พร้อมใช้งานชั่วคราว", requestId: id }, 503);
  }
}
