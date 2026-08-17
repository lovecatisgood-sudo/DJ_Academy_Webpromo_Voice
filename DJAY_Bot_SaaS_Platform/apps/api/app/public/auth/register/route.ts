import { registrationInputSchema } from "@djay/auth";
import type { NextRequest } from "next/server";
import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";
import { PUBLIC_BUILDER_TEST_COOKIE, parsePublicBuilderTestSession } from "../../../../lib/public-builder-test-quota";

export async function POST(request: NextRequest) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ code: "authorization_denied", message: "คำขอถูกปฏิเสธ", requestId: id }, 403);
  let locale: "th" | "en" = "th";
  try {
    const raw = await readJson(request);
    locale = typeof raw === "object" && raw !== null && "locale" in raw && raw.locale === "en" ? "en" : "th";
    const body = registrationInputSchema.parse(raw);
    const [accountLimit, clientLimit] = await Promise.all([
      enforceRateLimit("register-account", body.email.trim().toLowerCase(), 5, 15 * 60 * 1000),
      enforceRateLimit("register-client", clientAddress(request), 30, 15 * 60 * 1000),
    ]);
    if (!accountLimit.allowed || !clientLimit.allowed) {
      const retry = Math.max(accountLimit.retryAfterSeconds, clientLimit.retryAfterSeconds);
      return safeJson({ code: "rate_limited", message: locale === "en" ? "Please wait before trying again." : "โปรดรอสักครู่ก่อนลองอีกครั้ง", requestId: id }, 429, {
        "Retry-After": String(retry),
      });
    }
    const services = await getServices();
    const { registration, legalDocuments } = services;
    if (!legalDocuments) {
      return safeJson({
        code: "registration_unavailable",
        message: locale === "en" ? "Registration is paused until the current service terms and privacy notice are available." : "หยุดรับลงทะเบียนชั่วคราวจนกว่าข้อกำหนดการให้บริการและประกาศความเป็นส่วนตัวฉบับปัจจุบันจะพร้อม",
        requestId: id,
      }, 503);
    }
    const builderSession = parsePublicBuilderTestSession(
      request.cookies.get(PUBLIC_BUILDER_TEST_COOKIE)?.value,
      services.rateLimitKey,
    );
    if (!builderSession) {
      return safeJson({
        accepted: false,
        status: "builder_draft_unavailable",
        message: locale === "en" ? "Return to the Builder and save your configuration before creating the account." : "โปรดกลับไปที่ Builder และบันทึกการตั้งค่าก่อนสร้างบัญชี",
        requestId: id,
      }, 409);
    }
    const result = await registration.register(body, { builderSessionId: builderSession.sessionId });
    return safeJson(result, result.accepted ? 202 : 409);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || (error instanceof Error && error.message === "request_too_large")) {
      return safeJson({ code: "validation_failed", message: locale === "en" ? "Check the submitted details." : "โปรดตรวจสอบข้อมูลที่กรอก", requestId: id }, 400);
    }
    console.error("registration_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: locale === "en" ? "Registration is unavailable. Try again shortly." : "ระบบลงทะเบียนไม่พร้อมใช้งาน โปรดลองอีกครั้งในภายหลัง", requestId: id }, 503);
  }
}
