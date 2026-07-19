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
      openAiApiKey: "sk-restricted-abcdefghijklmnopqrstuvwxyz",
      openAiModel: "restricted-route",
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
});
