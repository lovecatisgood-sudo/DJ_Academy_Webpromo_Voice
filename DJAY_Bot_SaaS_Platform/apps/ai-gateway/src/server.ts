import {
  createCompatibleChatTextGateway,
  createOpenAIResponsesGateway,
  ProviderGatewayError,
  type TextProviderGateway,
} from "@djay/provider-gateway";
import { salesCoreOutputSchema } from "@djay/sales-core";
import { z } from "zod";

const requestSchema = z.object({
  capability: z.enum(["sales_text", "translation"]),
  correlationId: z.string().trim().min(1).max(200),
  locale: z.enum(["th", "en"]),
  systemPolicy: z.string().min(1).max(100_000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().max(20_000),
  }).strict()).max(100),
  customerMessage: z.string().min(1).max(20_000),
  structuredOutputSchemaVersion: z.enum(["sales-core.v1", "translation.v1"]),
  structuredOutputJsonSchema: z.record(z.string(), z.unknown()).optional(),
}).strict().superRefine((value, context) => {
  if (value.capability === "sales_text" && value.structuredOutputSchemaVersion !== "sales-core.v1") {
    context.addIssue({ code: "custom", message: "Sales requests require sales-core.v1." });
  }
  if (value.capability === "translation" && value.structuredOutputSchemaVersion !== "translation.v1") {
    context.addIssue({ code: "custom", message: "Translation requests require translation.v1." });
  }
});

const salesCoreJsonSchema = z.toJSONSchema(salesCoreOutputSchema, { target: "draft-7" });
const xaiClientSecretSchema = z.object({
  value: z.string().min(20).max(2_000), expires_at: z.number().int().positive(),
}).passthrough();

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function createAiGatewayHandler(config: Readonly<{
  serviceToken: string;
  provider: "openai" | "xai" | "gemini";
  apiKey: string;
  model: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  voice?: Readonly<{ apiKey: string; model: string; voice: string }>;
}>) {
  let gateway: TextProviderGateway;
  if (config.provider === "openai") {
    gateway = createOpenAIResponsesGateway({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
      ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
  } else {
    gateway = createCompatibleChatTextGateway({
      apiKey: config.apiKey,
      model: config.model,
      endpoint: config.provider === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      ...(config.maxOutputTokens ? { maxOutputTokens: config.maxOutputTokens } : {}),
      ...(config.timeoutMs ? { timeoutMs: config.timeoutMs } : {}),
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
  }
  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health/live") return json({ status: "live" }, 200);
    if (request.method === "GET" && url.pathname === "/health/ready") return json({ status: "ready" }, 200);
    if (request.method !== "POST" || !["/v1/generate", "/v1/voice/client-secret"].includes(url.pathname)) {
      return json({ status: "not_found" }, 404);
    }
    if (request.headers.get("authorization") !== `Bearer ${config.serviceToken}`) {
      return json({ status: "not_found" }, 404);
    }
    if (url.pathname === "/v1/voice/client-secret") {
      if (!config.voice) return json({ status: "not_available" }, 503);
      try {
        const response = await (config.fetchImpl ?? fetch)("https://api.x.ai/v1/realtime/client_secrets", {
          method: "POST",
          headers: { Authorization: `Bearer ${config.voice.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ expires_after: { seconds: 300 } }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 10_000),
        });
        if (!response.ok) return json({ status: "gateway_unavailable" }, 503);
        const secret = xaiClientSecretSchema.parse(await response.json());
        const websocketUrl = new URL("wss://api.x.ai/v1/realtime");
        websocketUrl.searchParams.set("model", config.voice.model);
        return json({
          token: secret.value, expiresAt: new Date(secret.expires_at * 1_000).toISOString(),
          websocketUrl: websocketUrl.toString(), model: config.voice.model, voice: config.voice.voice,
        }, 200);
      } catch {
        return json({ status: "gateway_unavailable" }, 503);
      }
    }
    try {
      const parsed = requestSchema.parse(await request.json());
      const structuredOutputJsonSchema = parsed.capability === "sales_text"
        ? salesCoreJsonSchema
        : parsed.structuredOutputJsonSchema;
      if (!structuredOutputJsonSchema) return json({ status: "invalid_request" }, 400);
      let result;
      try {
        result = await gateway.generate({ ...parsed, structuredOutputJsonSchema });
      } catch (error) {
        if (!(error instanceof ProviderGatewayError) || error.code !== "gateway_unavailable") throw error;
        result = await gateway.generate({
          ...parsed,
          correlationId: `${parsed.correlationId}:availability-retry`,
          structuredOutputJsonSchema,
        });
      }
      return json(result, 200);
    } catch (error) {
      if (error instanceof ProviderGatewayError) {
        console.error("ai_gateway_provider_failed", { reason: error.code });
        return json({ status: error.code }, error.code === "gateway_timeout" ? 504 : 503);
      }
      console.error("ai_gateway_request_failed", {
        reason: error instanceof Error ? error.message : "unknown_error",
      });
      return json({ status: "invalid_request" }, 400);
    }
  };
}
