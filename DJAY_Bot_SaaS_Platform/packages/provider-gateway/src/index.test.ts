import { describe, expect, it } from "vitest";
import { assertProviderNeutralCustomerText, createHttpTextProviderGateway, ProviderGatewayError } from "./index";

const request = {
  correlationId: "turn-1", locale: "en" as const, systemPolicy: "policy", messages: [],
  customerMessage: "Hello", structuredOutputSchemaVersion: "sales-core.v1" as const,
};

describe("internal text gateway", () => {
  it("normalizes a valid result without routing metadata", async () => {
    const gateway = createHttpTextProviderGateway({
      endpoint: "https://ai-gateway.internal/generate", serviceToken: "secret",
      fetchImpl: async (_input, init) => {
        expect(JSON.parse(String(init?.body))).toMatchObject({ capability: "sales_text", customerMessage: "Hello" });
        return new Response(JSON.stringify({ output: { ok: true }, nativeUsage: { inputUnits: 12, outputUnits: 8 } }), { status: 200 });
      },
    });
    await expect(gateway.generate(request)).resolves.toEqual({ output: { ok: true }, nativeUsage: { inputUnits: 12, outputUnits: 8 } });
  });

  it("returns only a stable safe error for upstream failures", async () => {
    const gateway = createHttpTextProviderGateway({
      endpoint: "https://ai-gateway.internal/generate", serviceToken: "secret",
      fetchImpl: async () => new Response("sensitive upstream body", { status: 503 }),
    });
    await expect(gateway.generate(request)).rejects.toEqual(new ProviderGatewayError("gateway_unavailable"));
  });

  it("rejects restricted routing identity in customer text", () => {
    expect(() => assertProviderNeutralCustomerText("This reply names GPT-5.")).toThrow(/gateway_invalid_response/);
  });
});
