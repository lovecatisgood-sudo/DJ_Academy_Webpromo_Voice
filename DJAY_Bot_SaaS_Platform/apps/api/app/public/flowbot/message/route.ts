import { publicFlowInputSchema } from "@djay/flowbot-domain";
import type { NextRequest } from "next/server";
import { ZodError, z } from "zod";
import { getServices } from "../../../../lib/container";
import { flowbotCorsHeaders, flowbotRequestCredentials, flowbotSessionToken } from "../../../../lib/flowbot-http";
import { clientAddress, enforceRateLimit, readJson, safeJson } from "../../../../lib/http";

const messageSchema = z.object({ inputId: z.uuid(), input: publicFlowInputSchema }).strict();

export async function POST(request: NextRequest) {
  const credentials = flowbotRequestCredentials(request);
  const sessionToken = flowbotSessionToken(request);
  if (!credentials || !sessionToken) return safeJson({ status: "not_found" }, 404);
  const services = await getServices();
  if (!services.flowbotRuntime) return safeJson({ status: "not_found" }, 404);
  const allowed = await enforceRateLimit(
    "flowbot_message",
    `${credentials.deploymentKey}:${clientAddress(request)}`,
    120,
    60_000,
  );
  if (!allowed.allowed) return safeJson({ status: "rate_limited" }, 429, flowbotCorsHeaders(credentials.origin));
  try {
    const body = messageSchema.parse(await readJson(request, 24_000));
    const response = await services.flowbotRuntime.advance({
      sessionToken,
      origin: credentials.origin,
      inputId: body.inputId,
      input: body.input,
    });
    return response
      ? safeJson({ status: "accepted", response }, 200, flowbotCorsHeaders(credentials.origin))
      : safeJson({ status: "not_found" }, 404, flowbotCorsHeaders(credentials.origin));
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400, flowbotCorsHeaders(credentials.origin));
    return safeJson({ status: "not_available" }, 409, flowbotCorsHeaders(credentials.origin));
  }
}

export { OPTIONS } from "../config/route";
