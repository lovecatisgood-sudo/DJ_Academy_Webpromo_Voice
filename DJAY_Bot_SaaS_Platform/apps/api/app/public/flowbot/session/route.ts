import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getServices } from "../../../../lib/container";
import { flowbotCorsHeaders, flowbotRequestCredentials } from "../../../../lib/flowbot-http";
import { clientAddress, enforceRateLimit, readJson, safeJson } from "../../../../lib/http";

const startSchema = z.object({ language: z.enum(["th", "en"]).optional() }).strict();

export async function POST(request: NextRequest) {
  const credentials = flowbotRequestCredentials(request);
  if (!credentials) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.flowbotRuntime) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit(
    "flowbot_session_start",
    `${credentials.deploymentKey}:${clientAddress(request)}`,
    30,
    60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, flowbotCorsHeaders(credentials.origin));
  try {
    const body = startSchema.parse(await readJson(request, 2_000));
    const started = await services.flowbotRuntime.start({
      ...credentials,
      ...(body.language ? { language: body.language } : {}),
    });
    return safeJson({ status: "started", ...started }, 201, flowbotCorsHeaders(credentials.origin));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400, flowbotCorsHeaders(credentials.origin));
    return safeJson({ status: "not_available" }, 404, flowbotCorsHeaders(credentials.origin));
  }
}

export { OPTIONS } from "../config/route";
