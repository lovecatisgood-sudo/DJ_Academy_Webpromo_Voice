import { describe, expect, it } from "vitest";
import { chunkKnowledge, salesCoreOutputSchema, selectRelevantKnowledge } from "./index";

const ids = {
  revision: "11111111-1111-4111-8111-111111111111",
  chunk: "22222222-2222-4222-8222-222222222222",
};

describe("Sales Conversation Core contract", () => {
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

  it("chunks and retrieves approved content deterministically", () => {
    const chunkIds = ["32222222-2222-4222-8222-222222222222", "42222222-2222-4222-8222-222222222222"];
    const chunks = chunkKnowledge("Website plans improve conversion.\n\nAppointment requests require confirmation.", 80)
      .map((content, index) => ({ sourceRevisionId: ids.revision, chunkId: chunkIds[index]!, content }));
    expect(selectRelevantKnowledge(chunks, "appointment confirmation", 1)[0]?.content).toContain("confirmation");
  });
});
