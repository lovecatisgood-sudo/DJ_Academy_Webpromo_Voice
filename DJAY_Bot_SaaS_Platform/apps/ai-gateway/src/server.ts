import {
  createCompatibleChatTextGateway,
  createOpenAIResponsesGateway,
  ProviderGatewayError,
  type TextProviderGateway,
} from "@djay/provider-gateway";
import { salesCoreOutputSchema } from "@djay/sales-core";
import { z } from "zod";

const requestSchema = z.object({
  capability: z.literal("sales_text"),
  correlationId: z.string().trim().min(1).max(200),
  locale: z.enum(["th", "en"]),
  systemPolicy: z.string().min(1).max(100_000),
  messages: z.array(z.object({
    role: z.enum(["user", "assistant"]), content: z.string().max(20_000),
  }).strict()).max(100),
  customerMessage: z.string().min(1).max(20_000),
  structuredOutputSchemaVersion: z.literal("sales-core.v1"),
}).strict();

const salesCoreJsonSchema = z.toJSONSchema(salesCoreOutputSchema, { target: "draft-7" });

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
  fetchImpl?: typeof fetch;
}>) {
  let gateway: TextProviderGateway;
  if (config.provider === "openai") {
    gateway = createOpenAIResponsesGateway({
      apiKey: config.apiKey,
      model: config.model,
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
  } else {
    gateway = createCompatibleChatTextGateway({
      apiKey: config.apiKey,
      model: config.model,
      endpoint: config.provider === "xai"
        ? "https://api.x.ai/v1/chat/completions"
        : "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
    });
  }
  return async (request: Request) => {
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health/live") return json({ status: "live" }, 200);
    if (request.method === "GET" && url.pathname === "/health/ready") return json({ status: "ready" }, 200);
    if (request.method !== "POST" || url.pathname !== "/v1/generate") return json({ status: "not_found" }, 404);
    if (request.headers.get("authorization") !== `Bearer ${config.serviceToken}`) {
      return json({ status: "not_found" }, 404);
    }
    try {
      const parsed = requestSchema.parse(await request.json());
      const result = await gateway.generate({ ...parsed, structuredOutputJsonSchema: salesCoreJsonSchema });
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
