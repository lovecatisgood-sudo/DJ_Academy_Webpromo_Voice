import { recoveryRequestInputSchema } from "@djay/auth";
import { ZodError } from "zod";
import { getServices } from "../../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ accepted: true, message: "หากมีบัญชีนี้อยู่ ระบบได้ส่งอีเมลกู้คืนบัญชีแล้ว" }, 202);
  try {
    const raw = await readJson(request);
    const body = recoveryRequestInputSchema.parse({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      requestId: id,
    });
    const [accountLimit, clientLimit] = await Promise.all([
      enforceRateLimit("recovery-account", body.email.trim().toLowerCase(), 4, 30 * 60 * 1000),
      enforceRateLimit("recovery-client", clientAddress(request), 20, 30 * 60 * 1000),
    ]);
    if (!accountLimit.allowed || !clientLimit.allowed) {
      return safeJson({ accepted: true, message: body.locale === "en" ? "If the account exists, a recovery email has been sent." : "หากมีบัญชีนี้อยู่ ระบบได้ส่งอีเมลกู้คืนบัญชีแล้ว" }, 202);
    }
    const { recovery } = await getServices();
    return safeJson(await recovery.request(body), 202);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ accepted: true, message: "หากมีบัญชีนี้อยู่ ระบบได้ส่งอีเมลกู้คืนบัญชีแล้ว" }, 202);
    }
    console.error("recovery_request_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: "ระบบกู้คืนบัญชีไม่พร้อมใช้งานชั่วคราว", requestId: id }, 503);
  }
}
