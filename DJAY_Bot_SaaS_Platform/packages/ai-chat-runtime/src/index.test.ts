import { describe, expect, it } from "vitest";
import { AiTextRuntime, AiTextRuntimeError, runAiTextPreview, type AiTurnContext, type AiTurnRepository } from "./index";
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
    let committedOutput: unknown;
    const runtime = new AiTextRuntime({
      ...repository(events),
      async commit(input) { events.push(`commit:${input.nativeUsage.inputUnits}`); committedOutput = input.output; return input.publicResponse; },
    }, { async generate() { return {
      output: {
        schemaVersion: "sales-core.v1", stage: "S5_OBJECTION", intent: "handle_objection",
        facts: [], knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
        responseGoal: "clarify lost conversion", proposedActions: [], handover: null,
        customerResponse: "That may mean visitors click but do not convert. Where do they usually drop off?",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 100, outputUnits: 30 },
    }; } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test", inputId: ids.input, message: "Ads cost too much" }))
      .resolves.toMatchObject({ status: "completed", inputId: ids.input });
    expect(committedOutput).toMatchObject({
      confidence: 0.9,
      safety: { state: "allowed", reasonCodes: [] },
    });
    expect(events).toEqual(["begin", "commit:100"]);
  });

  it("uses claimed behavior and a matching bilingual FAQ as operational grounding", async () => {
    const events: string[] = [];
    let policy = "";
    const faqContext: AiTurnContext = {
      ...context,
      playbook: { ...(context.playbook as object), behaviorInstructions: "Answer the question before offering a next step",
        behaviorBoundaries: "Escalate requests outside approved hours",
        approvedFaqs: [{ question: { en: "When are you open?", th: "เปิดกี่โมง" }, answer: { en: "We are open on weekdays.", th: "เปิดวันธรรมดา" } }] },
      knowledgeChunks: [],
    };
    const runtime = new AiTextRuntime({
      ...repository(events), async begin() { events.push("begin"); return faqContext; },
    }, { async generate(request) {
      policy = request.systemPolicy;
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S4_RECOMMENDATION", intent: "answer_hours",
        facts: [], knowledgeCitations: [], responseGoal: "answer opening hours", proposedActions: [], handover: null,
        customerResponse: "We are open on weekdays.", channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 25, outputUnits: 8 } };
    } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "When are you open?" })).resolves.toMatchObject({ status: "completed", text: "We are open on weekdays." });
    expect(policy).toContain("Conversation behavior: Answer the question before offering a next step");
    expect(policy).toContain("Behavior boundaries and human handover: Escalate requests outside approved hours");
    expect(policy).toContain("FAQ: When are you open? Answer: We are open on weekdays.");
    expect(events).toEqual(["begin", "commit:25"]);
  });

  it("grounds a business-offer answer in the immutable Builder profile", async () => {
    const events: string[] = [];
    let policy = "";
    const businessContext: AiTurnContext = {
      ...context,
      playbook: { ...(context.playbook as object), approvedClaims: [], builderContext: {
        productFamily: "text", disclosure: { en: "AI assistant", th: "ผู้ช่วย AI" },
        businessType: "Consulting", businessSummary: "Conversion advisory for small businesses",
        offers: "A 30-minute conversion consultation", businessHours: "Monday to Friday",
        contact: "team@example.test", agentBehavior: "Ask one useful question",
        agentBoundaries: "Never invent availability", faqs: [],
      } },
      knowledgeChunks: [],
      recentMessages: [],
    };
    const runtime = new AiTextRuntime({
      ...repository(events), async begin() { events.push("begin"); return businessContext; },
    }, { async generate(request) {
      policy = request.systemPolicy;
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S4_RECOMMENDATION", intent: "answer_services",
        facts: [], knowledgeCitations: [], responseGoal: "answer the service question", proposedActions: [], handover: null,
        customerResponse: "A 30-minute conversion consultation is available.",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 22, outputUnits: 7 } };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "What consultation do you offer?",
    })).resolves.toMatchObject({ status: "completed", text: "A 30-minute conversion consultation is available." });
    expect(policy).toContain('"kind":"offers","content":"A 30-minute conversion consultation"');
    expect(events).toEqual(["begin", "commit:22"]);
  });

  it("retrieves a published structured catalogue item as cited evidence", async () => {
    const events: string[] = []; let policy = "";
    const catalogueContent = JSON.stringify({ kind: "service", externalKey: "consult-30",
      name: { th: "ปรึกษา 30 นาที", en: "30-minute consultation" },
      description: { th: "คำแนะนำธุรกิจ", en: "Approved business advice" },
      priceMinor: 150000, currency: "THB", availability: "available",
      actionReference: { kind: "booking", value: "consultation" } });
    const catalogueContext: AiTurnContext = { ...context, recentMessages: [], knowledgeChunks: [
      { sourceRevisionId: ids.revision, chunkId: ids.chunk, content: catalogueContent },
    ] };
    const runtime = new AiTextRuntime({ ...repository(events), async begin() { events.push("begin"); return catalogueContext; } }, {
      async generate(request) { policy = request.systemPolicy; return { output: {
        schemaVersion: "sales-core.v1", stage: "S4_RECOMMENDATION", intent: "answer_catalogue",
        facts: [], knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
        responseGoal: "answer the catalogue question", proposedActions: [], handover: null,
        customerResponse: "The 30-minute consultation is available for THB 1,500.",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 27, outputUnits: 9 } }; },
    });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Tell me about the 30-minute consultation and availability." }))
      .resolves.toMatchObject({ status: "completed", text: "The 30-minute consultation is available for THB 1,500." });
    expect(policy).toContain('\\"externalKey\\":\\"consult-30\\"');
    expect(policy).toContain(`"sourceRevisionId":"${ids.revision}"`); expect(events).toEqual(["begin", "commit:27"]);
  });

  it("allows a Sales Associate to propose a pending appointment after discovery without changing roles", async () => {
    const events: string[] = [];
    let committedOutput: unknown;
    const salesAppointmentContext: AiTurnContext = {
      ...context,
      authority: { entitlements: { "lead_capture.enabled": true, "appointment_request.enabled": true }, limits: {} },
      recentMessages: [
        { sequence: 1, role: "assistant", content: "What would you like to improve?" },
        { sequence: 2, role: "user", content: "Conversion from our website." },
      ],
    };
    const runtime = new AiTextRuntime({
      ...repository(events),
      async begin() { events.push("begin"); return salesAppointmentContext; },
      async commit(input) { events.push(`commit:${input.nativeUsage.inputUnits}`); committedOutput = input.output; return input.publicResponse; },
    }, { async generate(request) {
      expect(request.systemPolicy).toContain("a Sales Associate may support the sale with an appointment.request");
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S8_APPOINTMENT", intent: "request_consultation", facts: [],
        knowledgeCitations: [], responseGoal: "submit a consultation request",
        proposedActions: [
          { type: "lead.capture", name: "Ada", email: "ada@example.test", need: "Conversion consultation" },
          { type: "appointment.request", timezone: "Asia/Bangkok", confirmationClaim: "pending_merchant_confirmation",
            options: [
              { startAt: "2026-08-20T09:00:00.000Z", endAt: "2026-08-20T09:30:00.000Z" },
              { startAt: "2026-08-21T09:00:00.000Z", endAt: "2026-08-21T09:30:00.000Z" },
            ] },
        ], handover: null,
        customerResponse: "I can submit these two consultation options as a request. The merchant still needs to confirm one.",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: 30, outputUnits: 18 } };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "I am Ada, ada@example.test. Please request a consultation.",
    })).resolves.toMatchObject({ status: "completed", text: expect.stringContaining("still needs to confirm") });
    expect(committedOutput).toMatchObject({
      stage: "S8_APPOINTMENT",
      proposedActions: [{ type: "lead.capture" }, { type: "appointment.request", confirmationClaim: "pending_merchant_confirmation" }],
    });
    expect(events).toEqual(["begin", "commit:30"]);
  });

  it("does not treat an unrelated approved claim as grounding for a recommendation", async () => {
    const events: string[] = [];
    const ungroundedContext: AiTurnContext = {
      ...context,
      authority: { entitlements: { "lead_capture.enabled": true, "human_handover.enabled": true }, limits: {} },
      knowledgeChunks: [],
    };
    const runtime = new AiTextRuntime({
      ...repository(events), async begin() { events.push("begin"); return ungroundedContext; },
    }, { async generate() { return { output: {
      schemaVersion: "sales-core.v1", stage: "S4_RECOMMENDATION", intent: "answer_refund",
      facts: [], knowledgeCitations: [], responseGoal: "answer refund question", proposedActions: [], handover: null,
      customerResponse: "Refunds are available within 30 days.", channelResponse: { format: "text", quickReplies: [] },
    }, nativeUsage: { inputUnits: 20, outputUnits: 7 } }; } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "What is your refund policy?" })).resolves.toMatchObject({ status: "handover" });
    expect(events).toEqual(["begin", "commit:20"]);
  });

  it("rewrites one oversized reply without cutting it and preserves structured evidence", async () => {
    const events: string[] = [];
    let calls = 0;
    const base = {
      schemaVersion: "sales-core.v1" as const, stage: "S5_OBJECTION" as const, intent: "handle_objection",
      facts: [], knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
      responseGoal: "clarify lost conversion", proposedActions: [], handover: null,
      channelResponse: { format: "text" as const, quickReplies: ["Tell me more"] },
    };
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return {
        output: { ...base, customerResponse: calls === 1
          ? Array.from({ length: 201 }, () => "word").join(" ")
          : "That may mean visitors click but do not convert. Where do they usually drop off?" },
        nativeUsage: { inputUnits: calls === 1 ? 100 : 10, outputUnits: calls === 1 ? 310 : 30 },
      };
    } });
    await expect(runtime.turn({ deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test", inputId: ids.input, message: "Tell me about consultations." }))
      .resolves.toMatchObject({ text: "That may mean visitors click but do not convert. Where do they usually drop off?" });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:110"]);
  });

  it("uses the merchant-approved fallback when the one shortening rewrite is still oversized", async () => {
    const events: string[] = [];
    let calls = 0;
    const fallbackContext: AiTurnContext = {
      ...context,
      playbook: { ...(context.playbook as object), customerMessages: {
        fallback: { en: "Merchant-approved length fallback", th: "คำตอบสำรองด้านความยาวที่ร้านค้าอนุมัติ" },
        handover: { en: "Handover pending", th: "กำลังรอส่งต่อ" },
        contactPrompt: { en: "Share contact details", th: "แจ้งข้อมูลติดต่อ" },
        bookingPrompt: { en: "Share appointment details", th: "แจ้งรายละเอียดนัดหมาย" },
        rolePrompt: { en: "How can I help?", th: "ให้ช่วยเรื่องใด" },
      } },
    };
    const runtime = new AiTextRuntime({
      ...repository(events), async begin() { events.push("begin"); return fallbackContext; },
    }, { async generate() {
      calls += 1;
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need", facts: [],
        knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
        responseGoal: "understand the need", proposedActions: [], handover: null,
        customerResponse: Array.from({ length: 201 }, () => "word").join(" "),
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: calls === 1 ? 100 : 10, outputUnits: 20 } };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Tell me about consultations.",
    })).resolves.toMatchObject({ text: "Merchant-approved length fallback", actions: [] });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:110"]);
  });

  it("counts Thai at runtime and accepts one complete locale-aware shortening rewrite", async () => {
    const events: string[] = [];
    let calls = 0;
    const thaiContext: AiTurnContext = { ...context, language: "th" };
    const runtime = new AiTextRuntime({
      ...repository(events), async begin() { events.push("begin"); return thaiContext; },
    }, { async generate() {
      calls += 1;
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need", facts: [],
        knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
        responseGoal: "understand the need", proposedActions: [], handover: null,
        customerResponse: calls === 1
          ? Array.from({ length: 201 }, () => "คำตอบ").join(" ")
          : "คุณต้องการผลลัพธ์แบบใดมากที่สุด?",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: calls === 1 ? 70 : 12, outputUnits: 20 } };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "ช่วยอธิบายบริการ",
    })).resolves.toMatchObject({ text: "คุณต้องการผลลัพธ์แบบใดมากที่สุด?" });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:82"]);
  });

  it("rejects a shortening rewrite that changes protected structured evidence", async () => {
    const events: string[] = [];
    let calls = 0;
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need",
        safety: calls === 1
          ? { state: "allowed", reasonCodes: [] }
          : { state: "refused", reasonCodes: ["policy_restriction"] },
        facts: [], knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
        responseGoal: "understand the need", proposedActions: [], handover: null,
        customerResponse: calls === 1
          ? Array.from({ length: 201 }, () => "word").join(" ")
          : "Which result matters most to you?",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: calls === 1 ? 30 : 5, outputUnits: 10 } };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Tell me more.",
    })).resolves.toMatchObject({
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:35"]);
  });

  it("repairs invalid structured output before returning a builder or deployed response", async () => {
    const events: string[] = [];
    let calls = 0;
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return {
        output: {
          schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need", facts: [],
          knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
          responseGoal: "understand the need",
          proposedActions: calls === 1
            ? [{ type: "follow_up.create", note: "Follow up", dueAt: "2026-08-20T09:00:00.000Z" }]
            : [],
          handover: null,
          customerResponse: "Which result matters most to you?",
          channelResponse: { format: "text", quickReplies: [] },
        },
        nativeUsage: { inputUnits: calls === 1 ? 40 : 15, outputUnits: 10 },
      };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "What can you help with?",
    })).resolves.toMatchObject({ text: "Which result matters most to you?" });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:55"]);
  });

  it("rewrites an unverified appointment-success claim to an explicit pending request", async () => {
    const events: string[] = [];
    let calls = 0;
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return { output: {
        schemaVersion: "sales-core.v1", stage: "S8_APPOINTMENT", intent: "request_appointment", facts: [],
        knowledgeCitations: [], responseGoal: "record an appointment request", proposedActions: [], handover: null,
        customerResponse: calls === 1
          ? "Your appointment is confirmed and booked for tomorrow."
          : "I recorded your appointment request. It remains pending until the merchant confirms it.",
        channelResponse: { format: "text", quickReplies: [] },
      }, nativeUsage: { inputUnits: calls === 1 ? 20 : 8, outputUnits: 8 } };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Can I request tomorrow?",
    })).resolves.toMatchObject({ text: "I recorded your appointment request. It remains pending until the merchant confirms it." });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:28"]);
  });

  it("deactivates unentitled model-proposed tools before committing a safe reply", async () => {
    const events: string[] = [];
    let committedOutput: unknown;
    const runtime = new AiTextRuntime({
      ...repository(events),
      async commit(input) { events.push(`commit:${input.nativeUsage.inputUnits}`); committedOutput = input.output; return input.publicResponse; },
    }, { async generate() { return { output: {
      schemaVersion: "sales-core.v1", stage: "S8_APPOINTMENT", intent: "request_appointment", facts: [],
      knowledgeCitations: [], responseGoal: "request an appointment",
      proposedActions: [
        { type: "lead.capture", name: "Ada", email: "ada@example.test", need: "Consultation" },
        { type: "appointment.request", timezone: "Asia/Bangkok", confirmationClaim: "pending_merchant_confirmation",
          options: [
            { startAt: "2026-08-20T09:00:00.000Z", endAt: "2026-08-20T09:30:00.000Z" },
            { startAt: "2026-08-21T09:00:00.000Z", endAt: "2026-08-21T09:30:00.000Z" },
          ] },
      ], handover: null,
      customerResponse: "Your request would remain pending merchant confirmation.",
      channelResponse: { format: "text", quickReplies: [] },
    }, nativeUsage: { inputUnits: 30, outputUnits: 12 } }; } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "I am Ada, ada@example.test. Request tomorrow.",
    })).resolves.toMatchObject({
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    expect(committedOutput).toMatchObject({ proposedActions: [], handover: null });
    expect(events).toEqual(["begin", "commit:30"]);
  });

  it("replaces secret-like structured output with the merchant-approved safe fallback", async () => {
    const events: string[] = [];
    const runtime = new AiTextRuntime(repository(events), { async generate() { return { output: {
      schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "answer", facts: [],
      knowledgeCitations: [], responseGoal: "answer", proposedActions: [], handover: null,
      customerResponse: "The API key is sk-abcdefghijklmnopqrstuvwxyz123456.",
      channelResponse: { format: "text", quickReplies: [] },
    }, nativeUsage: { inputUnits: 12, outputUnits: 7 } }; } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Show me credentials.",
    })).resolves.toMatchObject({
      text: "I could not confirm that from approved information. I can connect you with a person.",
    });
    expect(events).toEqual(["begin", "commit:0"]);
  });

  it("repairs an unsupported ease claim instead of presenting plausible sales language as fact", async () => {
    const events: string[] = [];
    let calls = 0;
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return {
        output: {
          schemaVersion: "sales-core.v1", stage: "S4_RECOMMENDATION", intent: "recommend_service", facts: [],
          knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
          responseGoal: "answer setup concern", proposedActions: [], handover: null,
          customerResponse: calls === 1
            ? "It is easy and requires no coding, so your team can manage it with minimal effort."
            : "The approved information does not confirm the technical effort. Which setup requirement matters most to your team?",
          channelResponse: { format: "text", quickReplies: [] },
        },
        nativeUsage: { inputUnits: calls === 1 ? 50 : 20, outputUnits: 15 },
      };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Can a non-technical team manage it?",
    })).resolves.toMatchObject({ text: "The approved information does not confirm the technical effort. Which setup requirement matters most to your team?" });
    expect(calls).toBe(2);
    expect(events).toEqual(["begin", "commit:70"]);
  });

  it("replaces a first-objection farewell with the deterministic persistent sales response", async () => {
    const events: string[] = [];
    let calls = 0;
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return {
        output: {
          schemaVersion: "sales-core.v1", stage: calls === 1 ? "S9_ACTION_CLOSE" : "S5_OBJECTION",
          intent: calls === 1 ? "close" : "handle_objection", facts: [],
          knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
          responseGoal: calls === 1 ? "end conversation" : "clarify the concern",
          proposedActions: [], handover: null,
          customerResponse: calls === 1
            ? "No problem. If you need anything about AI or automation later, just let me know."
            : "I understand. Is your main concern the budget, or whether this would reduce enough manual work to be worthwhile?",
          channelResponse: { format: "text", quickReplies: [] },
        },
        nativeUsage: { inputUnits: calls === 1 ? 100 : 20, outputUnits: calls === 1 ? 20 : 25 },
      };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "No, it seems too expensive.",
    })).resolves.toMatchObject({
      text: "I understand. Is the main concern the available budget, or whether the expected value justifies the cost? I can compare the approved scope with the outcome you need.",
    });
    expect(calls).toBe(1);
    expect(events).toEqual(["begin", "commit:100"]);
  });

  it("uses the persistent response after multiple earlier objections instead of treating their count as an opt-out", async () => {
    const events: string[] = [];
    let calls = 0;
    const repeatedObjectionContext: AiTurnContext = {
      ...context,
      recentMessages: [
        { sequence: 1, role: "assistant", content: "Would the standard package fit?" },
        { sequence: 2, role: "user", content: "No" },
        { sequence: 3, role: "assistant", content: "Would a smaller package help?" },
        { sequence: 4, role: "user", content: "No" },
      ],
    };
    const runtime = new AiTextRuntime({
      ...repository(events),
      async begin() { events.push("begin"); return repeatedObjectionContext; },
    }, { async generate() {
      calls += 1;
      return {
        output: {
          schemaVersion: "sales-core.v1", stage: calls === 1 ? "S9_ACTION_CLOSE" : "S5_OBJECTION",
          intent: calls === 1 ? "close" : "handle_objection", facts: [],
          knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
          responseGoal: calls === 1 ? "end conversation" : "understand the current concern",
          proposedActions: [], handover: null,
          customerResponse: calls === 1
            ? "No problem. If you need anything later, just let me know."
            : "Understood. What is the main reason: budget, timing, fit, or trust? I can address only that point without repeating the same pitch.",
          channelResponse: { format: "text", quickReplies: [] },
        },
        nativeUsage: { inputUnits: calls === 1 ? 80 : 20, outputUnits: calls === 1 ? 15 : 25 },
      };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "No",
    })).resolves.toMatchObject({
      text: "Understood. What is the main reason: budget, timing, fit, or trust? I can address only that point without repeating the same pitch.",
    });
    expect(calls).toBe(1);
    expect(events).toEqual(["begin", "commit:80"]);
  });

  it("honors an unmistakable conversation-level exit without trying another sales move", async () => {
    const events: string[] = [];
    let calls = 0;
    const runtime = new AiTextRuntime(repository(events), { async generate() {
      calls += 1;
      return {
        output: {
          schemaVersion: "sales-core.v1", stage: "S9_ACTION_CLOSE", intent: "close", facts: [],
          knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
          responseGoal: "honor explicit exit", proposedActions: [], handover: null,
          customerResponse: "Understood. I will end the conversation now.",
          channelResponse: { format: "text", quickReplies: [] },
        },
        nativeUsage: { inputUnits: 30, outputUnits: 10 },
      };
    } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "Stop selling and end this conversation.",
    })).resolves.toMatchObject({ text: "Understood. I will end the conversation now." });
    expect(calls).toBe(1);
    expect(events).toEqual(["begin", "commit:30"]);
  });

  it("commits the merchant fallback when structured output invents a citation", async () => {
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
      .resolves.toMatchObject({ status: "completed", text: "I could not confirm that from approved information. I can connect you with a person." });
    expect(events).toEqual(["begin", "commit:1"]);
  });

  it("removes an invented citation from a safe builder preview instead of failing the draft test", async () => {
    const preview = runAiTextPreview({
      gateway: { async generate() { return {
        output: {
          schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need", facts: [],
          knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: "88888888-8888-4888-8888-888888888888" }],
          responseGoal: "understand the need", proposedActions: [], handover: null,
          customerResponse: "Which result matters most to you?",
          channelResponse: { format: "text", quickReplies: [] },
        },
        nativeUsage: { inputUnits: 10, outputUnits: 10 },
      }; } },
      inputId: ids.input,
      playbook: { ...(context.playbook as object), customerMessages: {
        fallback: { en: "Merchant-approved safe fallback", th: "คำตอบสำรองที่ร้านค้าอนุมัติ" },
        handover: { en: "Handover pending", th: "กำลังรอส่งต่อ" },
        contactPrompt: { en: "Share contact details", th: "แจ้งข้อมูลติดต่อ" },
        bookingPrompt: { en: "Share appointment details", th: "แจ้งรายละเอียดนัดหมาย" },
        rolePrompt: { en: "How can I help?", th: "ให้ช่วยเรื่องใด" },
      } },
      language: "en",
      knowledgeChunks: context.knowledgeChunks,
      message: "What can you help with?",
    });
    await expect(preview).resolves.toMatchObject({ status: "completed", citationCount: 0 });
  });

  it("keeps the builder test available with a marked safe fallback when two provider outputs are malformed", async () => {
    let calls = 0;
    const preview = runAiTextPreview({
      gateway: { async generate() {
        calls += 1;
        return { output: { malformed: true }, nativeUsage: { inputUnits: 10, outputUnits: 2 } };
      } },
      inputId: ids.input,
      playbook: { ...(context.playbook as object), customerMessages: {
        fallback: { en: "Merchant-approved safe fallback", th: "คำตอบสำรองที่ร้านค้าอนุมัติ" },
        handover: { en: "Handover pending", th: "กำลังรอส่งต่อ" },
        contactPrompt: { en: "Share contact details", th: "แจ้งข้อมูลติดต่อ" },
        bookingPrompt: { en: "Share appointment details", th: "แจ้งรายละเอียดนัดหมาย" },
        rolePrompt: { en: "How can I help?", th: "ให้ช่วยเรื่องใด" },
      } },
      language: "en",
      knowledgeChunks: context.knowledgeChunks,
      message: "What can you help with?",
    });
    await expect(preview).resolves.toMatchObject({ status: "completed", text: "Merchant-approved safe fallback", fallbackApplied: true, citationCount: 0 });
    expect(calls).toBe(2);
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

  it("commits a safe customer response with no upstream detail during an outage", async () => {
    const events: string[] = [];
    const runtime = new AiTextRuntime(repository(events), {
      async generate() { throw new ProviderGatewayError("gateway_unavailable"); },
    });
    const result = runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "hello",
    });
    await expect(result).resolves.toMatchObject({
      status: "completed",
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    expect(events).toEqual(["begin", "commit:0"]);
    await expect(result.then((response) => JSON.stringify(response))).resolves.not.toMatch(/restricted|upstream body|provider|model/i);
  });

  it.each([
    "provider_refusal",
    "policy_violation",
    "gateway_timeout",
    "provider_quota_exhausted",
    "gateway_unavailable",
  ] as const)("commits an explicit provider-neutral %s fallback state", async (code) => {
    let committedIntent = "";
    const runtime = new AiTextRuntime({
      ...repository([]),
      async commit(input) { committedIntent = input.output.intent; return input.publicResponse; },
    }, { async generate() { throw new ProviderGatewayError(code); } });
    const response = await runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "hello",
    });
    expect(response).toMatchObject({
      status: "completed",
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    expect(committedIntent).toBe(`safe_fallback.${code}`);
    expect(JSON.stringify(response)).not.toMatch(/refusal|policy|quota|timeout|gateway|provider|model/i);
  });

  it("releases the turn if the durable fallback cannot be committed", async () => {
    const events: string[] = [];
    const runtime = new AiTextRuntime({
      ...repository(events),
      async commit() { events.push("commit:failed"); throw new Error("database unavailable"); },
    }, { async generate() { throw new ProviderGatewayError("gateway_unavailable"); } });
    await expect(runtime.turn({
      deploymentKey: "deployment", sessionToken: "opaque", origin: "https://merchant.test",
      inputId: ids.input, message: "hello",
    })).rejects.toEqual(expect.objectContaining({ code: "generation_failed" }));
    expect(events).toEqual(["begin", "commit:failed", "fail:gateway_unavailable"]);
  });
});
