import { createServer } from "node:http";
import { assertNoProductionPlaceholders } from "@djay/shared/production-config";
import { z } from "zod";
import { createAiGatewayHandler } from "./server";

const env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(3106),
  AI_TEXT_GATEWAY_SERVICE_TOKEN: z.string().min(32),
  AI_TEXT_PROVIDER: z.enum(["openai", "xai", "gemini"]).default("openai"),
  AI_TEXT_API_KEY: z.string().min(20).optional(),
  AI_TEXT_MODEL: z.string().trim().min(2).max(160).optional(),
  AI_TEXT_MAX_OUTPUT_TOKENS: z.coerce.number().int().min(512).max(4_000).default(1_600),
  AI_TEXT_PROVIDER_TIMEOUT_MS: z.coerce.number().int().min(2_000).max(60_000).default(20_000),
  OPENAI_API_KEY: z.string().min(20).optional(),
  OPENAI_RESPONSES_MODEL: z.string().trim().min(2).max(160).optional(),
  XAI_API_KEY: z.string().min(20).optional(),
  GROK_API_KEY: z.string().min(20).optional(),
  XAI_TEXT_MODEL: z.string().trim().min(2).max(160).optional(),
  XAI_VOICE_MODEL: z.string().trim().min(2).max(160).default("grok-voice-latest"),
  XAI_VOICE_NAME: z.string().trim().min(2).max(80).default("eve"),
  GEMINI_API_KEY: z.string().min(20).optional(),
  GEMINI_TEXT_MODEL: z.string().trim().min(2).max(160).optional(),
}).superRefine((value, context) => {
  const selected = value.AI_TEXT_PROVIDER === "openai"
    ? [value.AI_TEXT_API_KEY ?? value.OPENAI_API_KEY, value.AI_TEXT_MODEL ?? value.OPENAI_RESPONSES_MODEL]
    : value.AI_TEXT_PROVIDER === "xai"
      ? [value.AI_TEXT_API_KEY ?? value.XAI_API_KEY ?? value.GROK_API_KEY, value.AI_TEXT_MODEL ?? value.XAI_TEXT_MODEL]
      : [value.AI_TEXT_API_KEY ?? value.GEMINI_API_KEY, value.AI_TEXT_MODEL ?? value.GEMINI_TEXT_MODEL];
  if (selected.some((item) => !item)) {
    context.addIssue({ code: "custom", message: `Selected ${value.AI_TEXT_PROVIDER} Text provider configuration is incomplete.` });
  }
}).parse(process.env);

assertNoProductionPlaceholders(env.NODE_ENV, env);
const handler = createAiGatewayHandler({
  serviceToken: env.AI_TEXT_GATEWAY_SERVICE_TOKEN,
  provider: env.AI_TEXT_PROVIDER,
  apiKey: env.AI_TEXT_API_KEY ?? (env.AI_TEXT_PROVIDER === "openai"
    ? env.OPENAI_API_KEY!
    : env.AI_TEXT_PROVIDER === "xai"
      ? (env.XAI_API_KEY ?? env.GROK_API_KEY)!
      : env.GEMINI_API_KEY!),
  model: env.AI_TEXT_MODEL ?? (env.AI_TEXT_PROVIDER === "openai"
    ? env.OPENAI_RESPONSES_MODEL!
    : env.AI_TEXT_PROVIDER === "xai"
      ? env.XAI_TEXT_MODEL!
      : env.GEMINI_TEXT_MODEL!),
  maxOutputTokens: env.AI_TEXT_MAX_OUTPUT_TOKENS,
  timeoutMs: env.AI_TEXT_PROVIDER_TIMEOUT_MS,
  ...((env.XAI_API_KEY ?? env.GROK_API_KEY ?? (env.AI_TEXT_PROVIDER === "xai" ? env.AI_TEXT_API_KEY : undefined))
    ? { voice: {
      apiKey: (env.XAI_API_KEY ?? env.GROK_API_KEY ?? env.AI_TEXT_API_KEY)!,
      model: env.XAI_VOICE_MODEL,
      voice: env.XAI_VOICE_NAME,
    } }
    : {}),
});

const server = createServer(async (request, response) => {
  const body = request.method === "GET" || request.method === "HEAD"
    ? undefined
    : await new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 512 * 1024) {
          reject(new Error("request_too_large"));
          request.destroy();
        } else chunks.push(chunk);
      });
      request.on("end", () => resolve(Buffer.concat(chunks)));
      request.on("error", reject);
    });
  const webRequest = new Request(`http://127.0.0.1:${env.PORT}${request.url ?? "/"}`, {
    method: request.method ?? "GET",
    headers: request.headers as HeadersInit,
    ...(body ? { body: body.toString("utf8") } : {}),
  });
  const result = await handler(webRequest);
  const headers: Record<string, string> = {};
  result.headers.forEach((value, name) => { headers[name] = value; });
  response.writeHead(result.status, headers);
  response.end(Buffer.from(await result.arrayBuffer()));
});

server.listen(env.PORT, "0.0.0.0", () => {
  console.info("ai_gateway_listening", { port: env.PORT });
});
