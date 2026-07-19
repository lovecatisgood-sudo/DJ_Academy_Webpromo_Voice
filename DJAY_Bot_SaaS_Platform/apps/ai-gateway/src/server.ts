import { createOpenAIResponsesGateway, ProviderGatewayError } from "@djay/provider-gateway";
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

function json(value: unknown, status: number) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

export function createAiGatewayHandler(config: Readonly<{
  serviceToken: string;
  openAiApiKey: string;
  openAiModel: string;
  fetchImpl?: typeof fetch;
}>) {
  const gateway = createOpenAIResponsesGateway({
    apiKey: config.openAiApiKey,
    model: config.openAiModel,
    ...(config.fetchImpl ? { fetchImpl: config.fetchImpl } : {}),
  });
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
      const result = await gateway.generate(parsed);
      return json(result, 200);
    } catch (error) {
      if (error instanceof ProviderGatewayError) {
        return json({ status: error.code }, error.code === "gateway_timeout" ? 504 : 503);
      }
      return json({ status: "invalid_request" }, 400);
    }
  };
}
