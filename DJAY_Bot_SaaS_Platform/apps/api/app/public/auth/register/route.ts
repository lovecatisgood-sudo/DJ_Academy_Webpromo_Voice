import { registrationInputSchema } from "@djay/auth";
import { ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ code: "authorization_denied", message: "Request denied.", requestId: id }, 403);
  try {
    const body = registrationInputSchema.parse(await readJson(request));
    const [accountLimit, clientLimit] = await Promise.all([
      enforceRateLimit("register-account", body.email.trim().toLowerCase(), 5, 15 * 60 * 1000),
      enforceRateLimit("register-client", clientAddress(request), 30, 15 * 60 * 1000),
    ]);
    if (!accountLimit.allowed || !clientLimit.allowed) {
      const retry = Math.max(accountLimit.retryAfterSeconds, clientLimit.retryAfterSeconds);
      return safeJson({ code: "rate_limited", message: "Please wait before trying again.", requestId: id }, 429, {
        "Retry-After": String(retry),
      });
    }
    const { registration } = await getServices();
    return safeJson(await registration.register(body), 202);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError || (error instanceof Error && error.message === "request_too_large")) {
      return safeJson({ code: "validation_failed", message: "Check the submitted details.", requestId: id }, 400);
    }
    console.error("registration_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: "Registration is unavailable. Try again shortly.", requestId: id }, 503);
  }
}
