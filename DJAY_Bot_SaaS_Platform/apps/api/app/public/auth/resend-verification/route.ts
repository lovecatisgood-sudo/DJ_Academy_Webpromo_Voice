import { z, ZodError } from "zod";
import { getServices } from "../../../../lib/container";
import { clientAddress, enforceRateLimit, hasTrustedOrigin, readJson, requestId, safeJson } from "../../../../lib/http";

const bodySchema = z.object({ email: z.email().max(320) }).strict();

export async function POST(request: Request) {
  const id = requestId();
  if (!(await hasTrustedOrigin(request))) return safeJson({ accepted: true });
  const limit = await enforceRateLimit("verification-resend", clientAddress(request), 5, 60 * 60 * 1000);
  if (!limit.allowed) return safeJson({ accepted: true });
  try {
    const body = bodySchema.parse(await readJson(request));
    const result = await (await getServices()).registration.resend({ ...body, requestId: id });
    return safeJson(result, 202);
  } catch (error) {
    return error instanceof ZodError || error instanceof SyntaxError
      ? safeJson({ code: "validation_failed" }, 400)
      : safeJson({ code: "temporarily_unavailable" }, 503);
  }
}
