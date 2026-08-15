import { describe, expect, it } from "vitest";
import { createAiGatewayHandler } from "./server";

const requestBody = {
  capability: "sales_text",
  correlationId: "turn-1",
  locale: "en",
  systemPolicy: "Policy",
  messages: [],
  customerMessage: "Hello",
  structuredOutputSchemaVersion: "sales-core.v1",
};

describe("restricted AI gateway", () => {
  it("requires service authority and returns only normalized output", async () => {
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz",
      provider: "openai",
      apiKey: "sk-restricted-abcdefghijklmnopqrstuvwxyz",
      model: "restricted-route",
      fetchImpl: async () => new Response(JSON.stringify({
        status: "completed",
        output: [{ type: "message", content: [{ type: "output_text", text: "{\"response\":\"Hello\"}" }] }],
        usage: { input_tokens: 3, output_tokens: 2 },
      }), { status: 200 }),
    });
    const denied = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST", body: JSON.stringify(requestBody),
    }));
    expect(denied.status).toBe(404);
    const accepted = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST",
      headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz", "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      output: { response: "Hello" },
      nativeUsage: { inputUnits: 3, outputUnits: 2, cachedUnits: 0 },
    });
  });

  it.each([
    ["xai" as const, "https://api.x.ai/v1/chat/completions"],
    ["gemini" as const, "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions"],
  ])("routes the owner-selected %s provider without exposing it", async (provider, endpoint) => {
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz",
      provider,
      apiKey: "restricted-provider-key-abcdefghijklmnopqrstuvwxyz",
      model: "owner-selected-route",
      fetchImpl: async (input) => {
        expect(String(input)).toBe(endpoint);
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"response\":\"Hello\"}" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }), { status: 200 });
      },
    });
    const accepted = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST",
      headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz", "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(accepted.status).toBe(200);
    expect(JSON.stringify(await accepted.json())).not.toMatch(/xai|grok|gemini|model/i);
  });

  it("accepts translation.v1 with its caller-supplied strict output schema", async () => {
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz",
      provider: "xai",
      apiKey: "restricted-provider-key-abcdefghijklmnopqrstuvwxyz",
      model: "owner-selected-route",
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.response_format.json_schema.schema).toMatchObject({ required: ["translations"] });
        return new Response(JSON.stringify({ choices: [{ message: { content: '{"translations":["บริการ"]}' } }], usage: { prompt_tokens: 3, completion_tokens: 2 } }), { status: 200 });
      },
    });
    const response = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST",
      headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz", "content-type": "application/json" },
      body: JSON.stringify({
        capability: "translation", correlationId: "translation-1", locale: "th", systemPolicy: "Translate", messages: [],
        customerMessage: '{"texts":["Services"]}', structuredOutputSchemaVersion: "translation.v1",
        structuredOutputJsonSchema: { type: "object", properties: { translations: { type: "array", items: { type: "string" } } }, required: ["translations"], additionalProperties: false },
      }),
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ output: { translations: ["บริการ"] } });
  });
});
