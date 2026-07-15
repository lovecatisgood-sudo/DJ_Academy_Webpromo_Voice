import { recoveryCompleteInputSchema } from "@djay/auth";
import { ZodError } from "zod";
import { getServices } from "../../../../../lib/container";
import { enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../../lib/http";

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ status: "invalid_or_expired" }, 400);
  try {
    const raw = await readJson(request);
    const body = recoveryCompleteInputSchema.parse({
      ...(typeof raw === "object" && raw !== null ? raw : {}),
      requestId: id,
    });
    const limit = await enforceRateLimit("recovery-token", body.token.slice(0, 24), 8, 30 * 60 * 1000);
    if (!limit.allowed) return safeJson({ status: "invalid_or_expired" }, 400);
    const { recovery } = await getServices();
    const result = await recovery.complete(body);
    return safeJson(result, result.status === "completed" ? 200 : 400);
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      return safeJson({ status: "invalid_or_expired" }, 400);
    }
    console.error("recovery_complete_failed", { requestId: id, error: error instanceof Error ? error.name : "unknown" });
    return safeJson({ code: "temporarily_unavailable", message: "Recovery is unavailable.", requestId: id }, 503);
  }
}
