import { describe, expect, it } from "vitest";
import { channels, conversationStatuses, crmStatuses, flowNodeTypes, messageSenders, messageTypes } from "./enums";

describe("canonical enums", () => {
  it("matches the integration contract values", () => {
    expect(conversationStatuses).toEqual(["bot", "awaiting_admin", "admin_active", "closed"]);
    expect(crmStatuses).toEqual(["new", "pending_follow_up", "appointment_made", "not_closed_follow", "closed_deal"]);
    expect(channels).toEqual(["web", "line", "messenger", "whatsapp", "voice"]);
    expect(messageSenders).toEqual(["bot", "visitor", "admin", "system"]);
    expect(messageTypes).toEqual(["text", "options", "cta", "form", "image", "audio", "system"]);
    expect(flowNodeTypes).toEqual([
      "message",
      "options",
      "cta_link",
      "cta_lead_form",
      "cta_contact_card",
      "cta_live_chat",
      "cta_scheduler"
    ]);
  });
});
