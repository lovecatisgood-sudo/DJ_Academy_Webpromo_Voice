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
      fetchImpl: async (_input, init) => {
        const body = JSON.parse(String(init?.body));
        expect(body.text.format).toMatchObject({ type: "json_schema", strict: true });
        expect(body.text.format.schema.required).toEqual(expect.arrayContaining([
          "customerResponse", "intent", "facts", "knowledgeCitations", "confidence", "safety", "proposedActions", "handover",
        ]));
        expect(body.text.format.schema.additionalProperties).toBe(false);
        return new Response(JSON.stringify({
          status: "completed",
          output: [{ type: "message", content: [{ type: "output_text", text: "{\"response\":\"Hello\"}" }] }],
          usage: { input_tokens: 3, output_tokens: 2 },
        }), { status: 200 });
      },
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
      maxOutputTokens: 1_600,
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe(endpoint);
        expect(JSON.parse(String(init?.body)).max_tokens).toBe(1_600);
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

  it("retries one transient provider-unavailable response before returning an outage", async () => {
    let calls = 0;
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz",
      provider: "xai",
      apiKey: "restricted-provider-key-abcdefghijklmnopqrstuvwxyz",
      model: "owner-selected-route",
      fetchImpl: async () => {
        calls += 1;
        if (calls === 1) return new Response("temporary", { status: 503 });
        return new Response(JSON.stringify({
          choices: [{ message: { content: "{\"response\":\"Recovered\"}" } }],
          usage: { prompt_tokens: 3, completion_tokens: 2 },
        }), { status: 200 });
      },
    });
    const response = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST",
      headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz", "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(200);
    expect(calls).toBe(2);
    expect(await response.json()).toMatchObject({ output: { response: "Recovered" } });
  });

  it.each([
    [429, { error: { message: "Sensitive quota detail" } }, 429, "provider_quota_exhausted"],
    [400, { error: { code: "content_policy_violation", message: "Sensitive policy detail" } }, 422, "policy_violation"],
  ] as const)("returns one stable operator-classified state for provider HTTP %s", async (providerStatus, body, expectedStatus, code) => {
    let calls = 0;
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz", provider: "openai",
      apiKey: "sk-restricted-abcdefghijklmnopqrstuvwxyz", model: "restricted-route",
      fetchImpl: async () => { calls += 1; return Response.json(body, { status: providerStatus }); },
    });
    const response = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST",
      headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz", "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(expectedStatus);
    expect(await response.json()).toEqual({ status: code });
    expect(calls).toBe(1);
  });

  it("returns a stable refusal state without provider text", async () => {
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz", provider: "openai",
      apiKey: "sk-restricted-abcdefghijklmnopqrstuvwxyz", model: "restricted-route",
      fetchImpl: async () => Response.json({
        status: "completed", output: [{ type: "message", content: [{ type: "refusal", refusal: "Sensitive refusal detail" }] }],
        usage: { input_tokens: 2, output_tokens: 1 },
      }),
    });
    const response = await handler(new Request("https://internal.example/v1/generate", {
      method: "POST",
      headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz", "content-type": "application/json" },
      body: JSON.stringify(requestBody),
    }));
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "provider_refusal" });
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

  it("issues a short-lived xAI Voice credential only to the internal API", async () => {
    const handler = createAiGatewayHandler({
      serviceToken: "service-token-abcdefghijklmnopqrstuvwxyz",
      provider: "xai", apiKey: "restricted-provider-key-abcdefghijklmnopqrstuvwxyz", model: "owner-text-route",
      voice: { apiKey: "restricted-voice-key-abcdefghijklmnopqrstuvwxyz", model: "grok-voice-latest", voice: "eve" },
      fetchImpl: async (input, init) => {
        expect(String(input)).toBe("https://api.x.ai/v1/realtime/client_secrets");
        expect(new Headers(init?.headers).get("authorization")).toBe("Bearer restricted-voice-key-abcdefghijklmnopqrstuvwxyz");
        return Response.json({ value: "xai-realtime-client-secret-abcdefghijklmnopqrstuvwxyz", expires_at: 1_900_000_000 });
      },
    });
    const denied = await handler(new Request("https://internal.example/v1/voice/client-secret", { method: "POST" }));
    expect(denied.status).toBe(404);
    const accepted = await handler(new Request("https://internal.example/v1/voice/client-secret", {
      method: "POST", headers: { authorization: "Bearer service-token-abcdefghijklmnopqrstuvwxyz" },
    }));
    expect(accepted.status).toBe(200);
    expect(await accepted.json()).toEqual({
      token: "xai-realtime-client-secret-abcdefghijklmnopqrstuvwxyz",
      expiresAt: new Date(1_900_000_000 * 1_000).toISOString(),
      websocketUrl: "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
      model: "grok-voice-latest", voice: "eve",
    });
  });
});
