import { AiTextRuntimeError, generateAiTurn } from "@djay/ai-chat-runtime";
import { ProviderGatewayError } from "@djay/provider-gateway";
import { ZodError, z } from "zod";
import { getServices } from "../../../../../lib/container";
import { readJson, safeJson } from "../../../../../lib/http";
import { hasVoiceServiceAuthority } from "../../../../../lib/voice-http";

const schema = z.object({
  sessionId: z.uuid(), connectionId: z.uuid(), inputId: z.uuid(),
  message: z.string().trim().min(1).max(2000),
}).strict();

function safeErrorCode(error: unknown) {
  if (error instanceof AiTextRuntimeError || error instanceof ProviderGatewayError) return error.code;
  if (error instanceof ZodError) return "structured_output_invalid";
  return "generation_failed";
}

export async function POST(request: Request) {
  const services = await getServices();
  if (!hasVoiceServiceAuthority(request, services.env.VOICE_AUTHORIZATION_SERVICE_TOKEN)) {
    return safeJson({ status: "not_found" }, 404);
  }
  if (!services.voiceRuntime || !services.aiTextGateway) return safeJson({ status: "not_available" }, 503);
  let input: z.infer<typeof schema> | null = null;
  let began = false;
  try {
    input = schema.parse(await readJson(request, 8_000));
    const context = await services.voiceRuntime.beginTurn(input); began = !context.replayResponse;
    if (context.replayResponse) return safeJson(context.replayResponse);
    const generated = await generateAiTurn({
      gateway: services.aiTextGateway, inputId: input.inputId, message: input.message, context,
    });
    return safeJson(await services.voiceRuntime.commitTurn({ ...input, ...generated }));
  } catch (error) {
    if (began && input && services.voiceRuntime) {
      await services.voiceRuntime.failTurn({ ...input, errorCode: safeErrorCode(error) }).catch(() => undefined);
    }
    if (error instanceof ZodError || error instanceof SyntaxError) return safeJson({ status: "validation_failed" }, 400);
    return safeJson({ status: "not_available", retryable: true }, 409);
  }
}
