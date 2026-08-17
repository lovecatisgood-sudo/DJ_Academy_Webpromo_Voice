import { describe, expect, it, vi } from "vitest";
import { createXaiBuilderVoiceSession, publicBuilderVoiceInstructions } from "./public-builder-voice";

const profile = {
  language: "en" as const,
  role: "sales" as const,
  business: {
    name: "DJAI Academy", summary: "AI education", offers: "AI training", hours: "Weekdays",
    contact: "hello@example.test", faqs: [{ question: "Price?", answer: "Contact us" }],
    agentObjective: "Help qualified customers", agentBehavior: "Warm and concise",
    agentBoundaries: "Never invent prices",
  },
};

describe("public builder xAI Voice session", () => {
  it("builds a grounded and concise role policy", () => {
    const policy = publicBuilderVoiceInstructions(profile);
    expect(policy).toContain("regardless of how many objections came before it");
    expect(policy).toContain("Never infer an opt-out from the number of objections");
    expect(policy).toContain("Change strategy instead of repeating the same pitch");
    expect(policy).toContain("End the conversation only when the customer unmistakably asks");
    expect(policy).not.toContain("stop after two clear refusals");
    expect(policy).toContain("never more than 200 words");
    expect(policy).toContain("Q: Price?\nA: Contact us");
    expect(policy).not.toMatch(/chain.of.thought|XAI_API_KEY/i);
  });

  it("exchanges the server key for a short-lived browser credential", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (url, init) => {
      expect(String(url)).toBe("http://ai-gateway.test/v1/voice/client-secret");
      expect(new Headers(init?.headers).get("authorization")).toBe("Bearer internal-service-token-abcdefghijklmnopqrstuvwxyz");
      return Response.json({
        token: "xai-realtime-client-secret-abcdefghijklmnopqrstuvwxyz",
        expiresAt: new Date(1_900_000_000 * 1_000).toISOString(),
        websocketUrl: "wss://api.x.ai/v1/realtime?model=grok-voice-latest",
        model: "grok-voice-latest", voice: "eve",
      });
    });
    const session = await createXaiBuilderVoiceSession({
      gatewayEndpoint: "http://ai-gateway.test/v1/generate",
      serviceToken: "internal-service-token-abcdefghijklmnopqrstuvwxyz", profile, fetchImpl,
    });
    expect(session.websocketUrl).toBe("wss://api.x.ai/v1/realtime?model=grok-voice-latest");
    expect(session.token).toMatch(/^xai-realtime-client-secret-/);
    expect(session.maxDurationSeconds).toBe(180);
  });
});
