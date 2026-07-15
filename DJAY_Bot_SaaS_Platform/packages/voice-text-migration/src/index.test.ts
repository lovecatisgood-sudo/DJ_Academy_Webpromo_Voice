import { describe, expect, it } from "vitest";
import { convertLegacyConversation, deterministicLegacyId } from "./index";

const conversation = {
  id: "11111111-1111-4111-8111-111111111111",
  started_at: new Date("2026-01-01T00:00:00Z"),
  ended_at: new Date("2026-01-01T00:02:00Z"),
  duration_seconds: 120,
  language: "th",
  transcript: [{ role: "user", text: "สวัสดี", t: 1_767_225_600_000 }, { role: "assistant", text: "ยินดีต้อนรับ", t: 1_767_225_601_000 }],
  summary: "Interested in a consultation",
  channel: "voice_widget",
  interaction_mode: "voice",
  messages: [],
  leads: [{
    id: "22222222-2222-4222-8222-222222222222",
    conversation_id: "11111111-1111-4111-8111-111111111111",
    client_name: "  Somchai  ",
    email: "SOMCHAI@EXAMPLE.COM",
    phone: "+66 81 234 5678",
    need: "AI sales assistant",
    status: "appointment_set",
    created_at: new Date("2026-01-01T00:01:00Z"),
  }],
};

describe("legacy Voice/Text conversion", () => {
  it("converts canonical messages, contact candidates, lead stages, and safe facts", () => {
    const result = convertLegacyConversation({ ...conversation, routing_vendor: "restricted", routing_model: "restricted" });
    expect(result.status).toBe("converted");
    if (result.status !== "converted") return;
    expect(result.value).toMatchObject({ productKey: "voice", channelKind: "voice", locale: "th", durationSeconds: 120 });
    expect(result.value.messages.map(({ actorType, direction }) => ({ actorType, direction }))).toEqual([
      { actorType: "customer", direction: "inbound" },
      { actorType: "ai", direction: "outbound" },
    ]);
    expect(result.value.leads[0]).toMatchObject({
      displayName: "Somchai",
      status: "appointment_made",
      identities: [{ kind: "email", value: "somchai@example.com" }, { kind: "phone", value: "+66812345678" }],
    });
    expect(JSON.stringify(result)).not.toContain("restricted");
  });

  it("quarantines channel mismatches and unsupported lead states", () => {
    expect(convertLegacyConversation({ ...conversation, interaction_mode: "text" })).toMatchObject({
      status: "quarantined", reasonCode: "legacy_channel_mode_mismatch",
    });
    expect(convertLegacyConversation({ ...conversation, leads: [{ ...conversation.leads[0], status: "mystery" }] })).toMatchObject({
      status: "quarantined", reasonCode: "legacy_lead_status_invalid",
    });
  });

  it("skips privacy-deleted records and generates stable tenant-bound IDs", () => {
    expect(convertLegacyConversation({ ...conversation, deleted_at: new Date() })).toEqual({ status: "skipped", reasonCode: "legacy_soft_deleted" });
    const first = deterministicLegacyId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "conversation", conversation.id);
    expect(first).toBe(deterministicLegacyId("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", "conversation", conversation.id));
    expect(first).not.toBe(deterministicLegacyId("bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "conversation", conversation.id));
  });
});
