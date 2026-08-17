import { describe, expect, it } from "vitest";
import { aiPlaybookFieldLimits, aiPlaybookSchema, buildSalesCorePolicy, chunkKnowledge, convertClaimedBuilderPlaybook, countVisibleCharacters, countVisibleWords, salesCoreOutputSchema, selectRelevantKnowledge } from "./index";

const ids = {
  revision: "11111111-1111-4111-8111-111111111111",
  chunk: "22222222-2222-4222-8222-222222222222",
};

describe("Sales Conversation Core contract", () => {
  it("publishes browser-safe playbook boundaries and rejects invalid timezones", () => {
    expect(aiPlaybookFieldLimits).toMatchObject({
      agentName: { minLength: 2, maxLength: 100 },
      businessName: { minLength: 2, maxLength: 200 },
      localizedMessage: { minLength: 1, maxLength: 500 },
      weeklyWindows: { maxItems: 21 },
    });
    expect(aiPlaybookSchema.safeParse({
      schemaVersion: 1,
      playbookVersionId: "54000000-0000-4000-8000-000000000001",
      businessName: "Studio",
      agentName: "Mali",
      languages: ["en"],
      tone: "Warm",
      salesGoal: "Qualify interest",
      approvedClaims: [],
      prohibitedClaims: [],
      discoveryQuestions: ["What would you like to improve?"],
      ctaPolicy: ["Offer a consultation"],
      requiredContactFields: ["name", "email"],
      greeting: { th: "สวัสดี", en: "Hello" },
      offlineMessage: { th: "ติดต่อกลับ", en: "We will follow up" },
      timezone: "not/a-timezone",
      weeklyWindows: [],
    }).success).toBe(false);
  });

  it("accepts a grounded bilingual discovery turn without effects", () => {
    expect(salesCoreOutputSchema.parse({
      schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_pain",
      facts: [{ type: "pain_point", value: "missed inquiries", source: "customer", status: "candidate", evidence: "We miss inquiries", confidence: 0.96 }],
      knowledgeCitations: [{ sourceRevisionId: ids.revision, chunkId: ids.chunk }],
      responseGoal: "clarify impact", proposedActions: [], handover: null,
      customerResponse: "เข้าใจครับ ตอนนี้คำถามจากลูกค้าหลุดช่วงเวลาไหนบ่อยที่สุด?",
      channelResponse: { format: "text", quickReplies: [] },
    }).stage).toBe("S2_DISCOVERY");
  });

  it("rejects appointment or email effects without validated lead capture", () => {
    expect(() => salesCoreOutputSchema.parse({
      schemaVersion: "sales-core.v1", stage: "S8_APPOINTMENT", intent: "request_time",
      facts: [], knowledgeCitations: [], responseGoal: "request appointment",
      proposedActions: [{ type: "merchant_email.send", templateKey: "ai_chat.lead_qualified" }],
      handover: null, customerResponse: "We will confirm later.", channelResponse: { format: "text", quickReplies: [] },
    })).toThrow(/Lead capture is required/);
  });

  it("instructs providers about cross-field action and handover invariants", () => {
    const policy = buildSalesCorePolicy({
      locale: "en", agentRole: "sales", businessName: "Studio", agentName: "Mali", tone: "Warm",
      salesGoal: "Qualify interest", approvedClaims: [], prohibitedClaims: [],
      discoveryQuestions: [], ctaPolicy: [], knowledge: [], recentMessages: [], customerMessage: "Hello",
    });
    expect(policy).toContain("only when the same proposedActions array also contains a valid lead.capture action");
    expect(policy).toContain("if and only if proposedActions contains handover.request");
    expect(policy).toContain("normally use about 40 to 80 words");
    expect(policy).toContain("never exceed 200 locale-aware words");
    expect(policy).toContain("regardless of how many concerns came before it");
    expect(policy).toContain("Do not infer a conversation-level rejection from an objection count");
    expect(policy).toContain("Only that explicit conversation-level exit permits S9_ACTION_CLOSE");
    expect(policy).toContain("For every active objection use stage S5_OBJECTION");
    expect(policy).toContain("direct conservative paraphrase of approved claims or approved knowledge");
    expect(policy).toContain("avoid repeating the same feature list");
    expect(policy).toContain("Do not offer to send, email, schedule, register, book");
    expect(policy).not.toContain("After two clear refusals");
  });

  it("counts English and unspaced Thai words and rejects only replies over 200 words", () => {
    expect(countVisibleCharacters("กำ")).toBe(1);
    expect(countVisibleWords("A concise helpful reply.", "en")).toBe(4);
    expect(countVisibleWords("ฉันชอบแมวและสุนัข", "th")).toBeGreaterThan(1);
    const makeOutput = (customerResponse: string) => ({
      schemaVersion: "sales-core.v1" as const, stage: "S2_DISCOVERY" as const, intent: "discover",
      facts: [], knowledgeCitations: [], responseGoal: "ask a question", proposedActions: [], handover: null,
      customerResponse, channelResponse: { format: "text" as const, quickReplies: [] },
    });
    expect(salesCoreOutputSchema.parse(makeOutput(Array.from({ length: 199 }, () => "word").join(" "))).customerResponse).toBeTruthy();
    expect(salesCoreOutputSchema.parse(makeOutput(Array.from({ length: 200 }, () => "word").join(" "))).customerResponse).toBeTruthy();
    expect(() => salesCoreOutputSchema.parse({
      ...makeOutput(Array.from({ length: 201 }, () => "word").join(" ")),
    })).toThrow(/exceeds 200 words/);
  });

  it("chunks and retrieves approved content deterministically", () => {
    const chunkIds = ["32222222-2222-4222-8222-222222222222", "42222222-2222-4222-8222-222222222222"];
    const chunks = chunkKnowledge("Website plans improve conversion.\n\nAppointment requests require confirmation.", 80)
      .map((content, index) => ({ sourceRevisionId: ids.revision, chunkId: chunkIds[index]!, content }));
    expect(selectRelevantKnowledge(chunks, "appointment confirmation", 1)[0]?.content).toContain("confirmation");
  });

  it("converts a complete claimed bilingual Voice draft without creating deployment state", () => {
    const source = "Hello, how can I help?";
    const disclosure = "I am an AI assistant.";
    const voiceDisclosure = "I am an AI voice assistant and this call may be transcribed.";
    const translated = (en: string, th: string) => ({ en, th, sourceEn: en, status: "needs_review", reviewed: false });
    const converted = convertClaimedBuilderPlaybook({
      schemaVersion: 1, locale: "en", family: "voice", templateOrRole: { role: "booking" },
      configuration: { textDraft: {
        business: { name: "Siamese Studio", type: "Services", summary: "Appointments", offers: "Consultation",
          hours: "Mon-Fri", contact: "team@example.test", agentObjective: "Collect an appointment request safely",
          agentBehavior: "Confirm details", agentBoundaries: "Never claim confirmation", faqs: [{ question: "When?", answer: "Weekdays" }] },
        botName: "Siamese Booking Assistant", language: "English and Thai", greeting: source,
        tone: "Warm and concise", disclosure, neverInvent: "Never invent availability", voice: { disclosure: voiceDisclosure },
        translations: { customerCopy: { greeting: translated(source, "สวัสดี มีอะไรให้ช่วย"),
          disclosure: translated(disclosure, "ฉันเป็นผู้ช่วย AI"),
          voiceDisclosure: translated(voiceDisclosure, "ฉันเป็นผู้ช่วยเสียง AI และสายนี้อาจถูกถอดความ") } },
      } },
    }, "54000000-0000-4000-8000-000000000099");
    expect(converted).toMatchObject({ status: "converted", productFamily: "voice", agentName: "Siamese Booking Assistant" });
    if (converted.status !== "converted") throw new Error("Expected conversion.");
    expect(converted.playbook).toMatchObject({ agentRole: "booking", languages: ["th", "en"],
      greeting: { en: source, th: "สวัสดี มีอะไรให้ช่วย" }, builderContext: { productFamily: "voice",
        businessHours: "Mon-Fri", faqs: [{ question: "When?", answer: "Weekdays" }] } });
  });

  it("rejects stale required Thai copy instead of publishing English as Thai", () => {
    expect(convertClaimedBuilderPlaybook({
      schemaVersion: 1, locale: "th", family: "text", templateOrRole: { role: "sales" },
      configuration: { textDraft: { business: { name: "Studio", agentObjective: "Qualify needs" },
        botName: "Studio Assistant", language: "English and Thai", greeting: "Hello", tone: "Warm", disclosure: "AI assistant",
        translations: { customerCopy: {
          greeting: { en: "Hello", th: "สวัสดี", sourceEn: "Older", status: "stale", reviewed: false },
          disclosure: { en: "AI assistant", th: "ผู้ช่วย AI", sourceEn: "AI assistant", status: "current", reviewed: true },
        } } } },
    }, "54000000-0000-4000-8000-000000000098")).toMatchObject({ status: "invalid", reasonCode: "builder_translation_incomplete" });
  });
});
