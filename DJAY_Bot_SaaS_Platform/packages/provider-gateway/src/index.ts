import { z } from "zod";

export * from "./live-voice";
export * from "./openai-realtime";

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
  structuredOutputSchemaVersion: "sales-core.v1" | "translation.v1";
  structuredOutputJsonSchema?: Readonly<Record<string, unknown>>;
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

const restrictedCustomerTerms = /\b(openai|anthropic|claude|gemini|xai|x\.ai|grok|gpt(?:-[a-z0-9.]+)?|model[_ -]?id|provider[_ -]?(?:name|key|id))\b/i;

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
          body: JSON.stringify({ capability: request.structuredOutputSchemaVersion === "translation.v1" ? "translation" : "sales_text", ...request }),
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

const openAiResponseSchema = z.object({
  status: z.literal("completed"),
  output: z.array(z.object({
    type: z.string(),
    content: z.array(z.object({
      type: z.string(),
      text: z.string().optional(),
    }).passthrough()).optional(),
  }).passthrough()),
  usage: z.object({
    input_tokens: z.number().int().nonnegative(),
    output_tokens: z.number().int().nonnegative(),
    input_tokens_details: z.object({
      cached_tokens: z.number().int().nonnegative().optional(),
    }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

function responseOutputText(response: z.infer<typeof openAiResponseSchema>) {
  return response.output.flatMap((item) => item.content ?? [])
    .filter((part) => part.type === "output_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("");
}

export function createOpenAIResponsesGateway(config: Readonly<{
  apiKey: string;
  model: string;
  endpoint?: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}>): TextProviderGateway {
  if (config.apiKey.length < 20 || !config.model.trim()) {
    throw new Error("Restricted AI text routing configuration is incomplete.");
  }
  const endpoint = new URL(config.endpoint ?? "https://api.openai.com/v1/responses");
  if (endpoint.protocol !== "https:") throw new Error("OpenAI Responses routing must use HTTPS.");
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async generate(request) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": request.correlationId,
          },
          body: JSON.stringify({
            model: config.model,
            instructions: request.systemPolicy,
            input: [
              ...request.messages.map((message) => ({
                role: message.role,
                content: [{ type: "input_text", text: message.content }],
              })),
              { role: "user", content: [{ type: "input_text", text: request.customerMessage }] },
            ],
            text: { format: request.structuredOutputJsonSchema
              ? {
                  type: "json_schema",
                  name: "sales_core_v1",
                  schema: request.structuredOutputJsonSchema,
                  strict: true,
                }
              : { type: "json_object" } },
            max_output_tokens: config.maxOutputTokens ?? 2_000,
            store: false,
            metadata: { correlation_id: request.correlationId },
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new ProviderGatewayError("gateway_timeout");
        }
        throw new ProviderGatewayError("gateway_unavailable");
      }
      if (!response.ok) throw new ProviderGatewayError("gateway_unavailable");
      try {
        const parsed = openAiResponseSchema.parse(await response.json());
        const output = JSON.parse(responseOutputText(parsed)) as unknown;
        assertProviderNeutralCustomerText(JSON.stringify(output));
        return gatewayResultSchema.parse({
          output,
          nativeUsage: {
            inputUnits: parsed.usage.input_tokens,
            outputUnits: parsed.usage.output_tokens,
            cachedUnits: parsed.usage.input_tokens_details?.cached_tokens ?? 0,
          },
        });
      } catch (error) {
        if (error instanceof ProviderGatewayError) throw error;
        throw new ProviderGatewayError("gateway_invalid_response");
      }
    },
  };
}

const compatibleChatResponseSchema = z.object({
  choices: z.array(z.object({
    message: z.object({ content: z.string() }).passthrough(),
  }).passthrough()).min(1),
  usage: z.object({
    prompt_tokens: z.number().int().nonnegative(),
    completion_tokens: z.number().int().nonnegative(),
    prompt_tokens_details: z.object({
      cached_tokens: z.number().int().nonnegative().optional(),
    }).passthrough().optional(),
  }).passthrough(),
}).passthrough();

/**
 * Restricted server-side adapter for providers that implement the OpenAI-compatible
 * Chat Completions contract. The endpoint and model are owner configuration and are
 * deliberately absent from the normalized result returned to product runtimes.
 */
export function createCompatibleChatTextGateway(config: Readonly<{
  apiKey: string;
  model: string;
  endpoint: string;
  timeoutMs?: number;
  maxOutputTokens?: number;
  fetchImpl?: typeof fetch;
}>): TextProviderGateway {
  if (config.apiKey.length < 20 || !config.model.trim()) {
    throw new Error("Restricted AI text routing configuration is incomplete.");
  }
  const endpoint = new URL(config.endpoint);
  if (endpoint.protocol !== "https:") throw new Error("AI text routing must use HTTPS.");
  const fetchImpl = config.fetchImpl ?? fetch;
  return {
    async generate(request) {
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            "Content-Type": "application/json",
            "Idempotency-Key": request.correlationId,
          },
          body: JSON.stringify({
            model: config.model,
            messages: [
              { role: "system", content: request.systemPolicy },
              ...request.messages,
              { role: "user", content: request.customerMessage },
            ],
            response_format: request.structuredOutputJsonSchema
              ? {
                  type: "json_schema",
                  json_schema: {
                    name: "sales_core_v1",
                    strict: true,
                    schema: request.structuredOutputJsonSchema,
                  },
                }
              : { type: "json_object" },
            max_tokens: config.maxOutputTokens ?? 2_000,
          }),
          signal: AbortSignal.timeout(config.timeoutMs ?? 30_000),
        });
      } catch (error) {
        if (error instanceof DOMException && error.name === "TimeoutError") {
          throw new ProviderGatewayError("gateway_timeout");
        }
        throw new ProviderGatewayError("gateway_unavailable");
      }
      if (!response.ok) throw new ProviderGatewayError("gateway_unavailable");
      try {
        const parsed = compatibleChatResponseSchema.parse(await response.json());
        const output = JSON.parse(parsed.choices[0]!.message.content) as unknown;
        assertProviderNeutralCustomerText(JSON.stringify(output));
        return gatewayResultSchema.parse({
          output,
          nativeUsage: {
            inputUnits: parsed.usage.prompt_tokens,
            outputUnits: parsed.usage.completion_tokens,
            cachedUnits: parsed.usage.prompt_tokens_details?.cached_tokens ?? 0,
          },
        });
      } catch (error) {
        if (error instanceof ProviderGatewayError) throw error;
        throw new ProviderGatewayError("gateway_invalid_response");
      }
    },
  };
}
