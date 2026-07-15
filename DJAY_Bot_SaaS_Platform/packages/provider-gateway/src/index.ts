import { z } from "zod";

export * from "./live-voice";

const gatewayResultSchema = z.object({
  output: z.unknown(),
  nativeUsage: z.object({
    inputUnits: z.number().int().nonnegative(),
    outputUnits: z.number().int().nonnegative(),
    cachedUnits: z.number().int().nonnegative().optional(),
  }).strict(),
}).strict();

export type TextGenerationRequest = Readonly<{
  correlationId: string;
  locale: "th" | "en";
  systemPolicy: string;
  messages: readonly { role: "user" | "assistant"; content: string }[];
  customerMessage: string;
  structuredOutputSchemaVersion: "sales-core.v1";
}>;

export type TextGenerationResult = z.infer<typeof gatewayResultSchema>;

export interface TextProviderGateway {
  generate(request: TextGenerationRequest): Promise<TextGenerationResult>;
}

export class ProviderGatewayError extends Error {
  constructor(readonly code: "gateway_timeout" | "gateway_unavailable" | "gateway_invalid_response") {
    super(code);
  }
}

const restrictedCustomerTerms = /\b(openai|anthropic|claude|gemini|gpt(?:-[a-z0-9.]+)?|model[_ -]?id|provider[_ -]?(?:name|key|id))\b/i;

export function assertProviderNeutralCustomerText(value: string) {
  if (restrictedCustomerTerms.test(value)) throw new ProviderGatewayError("gateway_invalid_response");
  return value;
}

export function createHttpTextProviderGateway(config: Readonly<{
  endpoint: string; serviceToken: string; timeoutMs?: number; fetchImpl?: typeof fetch;
}>): TextProviderGateway {
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:" && endpoint.hostname !== "127.0.0.1" && endpoint.hostname !== "localhost") {
    throw new Error("AI text gateway must use HTTPS.");
  }
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async generate(request) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.serviceToken}`,
            "Content-Type": "application/json",
            "Idempotency-Key": request.correlationId,
          },
          body: JSON.stringify({ capability: "sales_text", ...request }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") throw new ProviderGatewayError("gateway_timeout");
        throw new ProviderGatewayError("gateway_unavailable");
      }
      if (!response.ok) throw new ProviderGatewayError("gateway_unavailable");
      try { return gatewayResultSchema.parse(await response.json()); }
      catch { throw new ProviderGatewayError("gateway_invalid_response"); }
    },
  };
}
