import { describe, expect, it } from "vitest";
import { AiTextRuntime, AiTextRuntimeError, type AiTurnContext, type AiTurnRepository } from "./index";
import { ProviderGatewayError } from "@djay/provider-gateway";

const ids = {
  session: "11111111-1111-4111-8111-111111111111", tenant: "22222222-2222-4222-8222-222222222222",
  conversation: "33333333-3333-4333-8333-333333333333", playbook: "44444444-4444-4444-8444-444444444444",
  input: "55555555-5555-4555-8555-555555555555", revision: "66666666-6666-4666-8666-666666666666",
  chunk: "77777777-7777-4777-8777-777777777777",
};
const context: AiTurnContext = {
  sessionId: ids.session, tenantId: ids.tenant, conversationId: ids.conversation,
  playbook: {
    schemaVersion: 1, playbookVersionId: ids.playbook, businessName: "Acme Studio", agentName: "Mali",
    languages: ["en"], tone: "Warm and concise", salesGoal: "Qualify consultation interest",
    approvedClaims: ["Consultations are available by request"], prohibitedClaims: ["Guaranteed results"],
    discoveryQuestions: ["What would you like to improve?"], ctaPolicy: ["Offer a consultation request"],
    requiredContactFields: ["name", "email"], greeting: { th: "สวัสดี", en: "Hello" },
    offlineMessage: { th: "ติดต่อกลับภายหลัง", en: "We will follow up" }, timezone: "Asia/Bangkok", weeklyWindows: [],
  },
  language: "en", authority: { entitlements: { "lead_capture.enabled": true }, limits: {} }, turnSequence: 1,
  recentMessages: [{ sequence: 1, role: "assistant", content: "Hello" }, { sequence: 2, role: "user", content: "Ads cost too much" }],
  knowledgeChunks: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk, content: "Improve conversion after ad clicks." }],
  replayResponse: null,
};

function repository(events: string[]): AiTurnRepository {
  return {
    async begin() { events.push("begin"); return context; },
    async commit(input) { events.push(`commit:${input.nativeUsage.inputUnits}`); return input.publicResponse; },
    async fail(input) { events.push(`fail:${input.errorCode}`); },
  };
}

describe("AI text runtime", () => {
  it("validates grounding and commits one provider-neutral structured turn", async () => {
    const events: string[] = [];
    const runtime = new AiTextRuntime(repository(events), { async generate() { return {
      output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_pain",
        facts: [], knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
        responseGoal: "clarify lost conversion", proposedActions: [], handover: null,
        customerResponse: "That may mean visitors click but do not convert. Where do they usually drop off?",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 100, outputUnits: 30 },
    }; } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test", inputId: ids.input, message: "Ads cost too much" }))
      .resolves.toMatchObject({ status: "completed", inputId: ids.input });
    expect(events).toEqual(["begin", "commit:100"]);
  });

  it("releases the turn when structured output invents a citation", async () => {
    const events: string[] = [];
    const runtime = new AiTextRuntime(repository(events), { async generate() { return {
      output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_pain", facts: [],
        knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: "88888888-8888-4888-8888-888888888888" }],
        responseGoal: "reply", proposedActions: [], handover: null, customerResponse: "Tell me more.",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 1, outputUnits: 1 },
    }; } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test", inputId: ids.input, message: "hello" }))
      .rejects.toEqual(new AiTextRuntimeError("grounding_invalid"));
    expect(events).toEqual(["begin", "fail:grounding_invalid"]);
  });

  it("returns a committed replay without calling the gateway", async () => {
    let gatewayCalls = 0;
    const replay = { status: "completed" as const, inputId: ids.input, text: "Original", quickReplies: [], nextTurnSequence: 2 };
    const runtime = new AiTextRuntime({
      async begin() { return { ...context, playbook: null, authority: null, turnSequence: 0, replayResponse: replay }; },
      async commit() { throw new Error("unexpected"); }, async fail() {},
    }, { async generate() { gatewayCalls += 1; throw new Error("unexpected"); } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test", inputId: ids.input, message: "changed" })).resolves.toEqual(replay);
    expect(gatewayCalls).toBe(0);
  });

  it("releases reserved authority and returns no upstream detail during an outage", async () => {
    const events: string[] = [];
    const runtime = new AiTextRuntime(repository(events), {
      async generate() { throw new ProviderGatewayError("gateway_unavailable"); },
    });
    const result = runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "hello",
    });
    await expect(result).rejects.toEqual(expect.objectContaining({ code: "generation_failed" }));
    expect(events).toEqual(["begin", "fail:gateway_unavailable"]);
    await expect(result.catch((error: unknown) => String(error))).resolves.not.toMatch(/restricted|upstream body|provider|model/i);
  });
});
