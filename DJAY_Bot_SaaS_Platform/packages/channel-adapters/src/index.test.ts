import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { normalizeSocialWebhook, renderSocialReply, verifySocialChallenge, verifySocialSignature } from "./index";

const lineCredentials = { channel: "line" as const, channelAccessToken: "token-token-token-token", channelSecret: "secret-secret-secret-secret" };
const whatsappCredentials = { channel: "whatsapp" as const, accessToken: "token-token-token-token", appSecret: "secret-secret-secret-secret", verifyToken: "verify-verify-verify", phoneNumberId: "phone-1", businessAccountId: "business-1" };

describe("social channel adapters", () => {
  it("verifies LINE and Meta signatures over the untouched body", () => {
    const body = Buffer.from('{"events":[]}');
    const lineSignature = createHmac("sha256", lineCredentials.channelSecret).update(body).digest("base64");
    const metaSignature = `sha256=${createHmac("sha256", whatsappCredentials.appSecret).update(body).digest("hex")}`;
    expect(verifySocialSignature("line", body, lineSignature, lineCredentials)).toBe(true);
    expect(verifySocialSignature("whatsapp", body, metaSignature, whatsappCredentials)).toBe(true);
    expect(verifySocialSignature("whatsapp", Buffer.from("changed"), metaSignature, whatsappCredentials)).toBe(false);
    expect(verifySocialChallenge("whatsapp", "subscribe", "verify-verify-verify", "123", whatsappCredentials)).toBe("123");
  });

  it("normalizes LINE, WhatsApp, and Messenger without executing unsupported media", () => {
    expect(normalizeSocialWebhook("line", { events: [{ type: "message", webhookEventId: "line-event", timestamp: 1000, source: { userId: "U1" }, replyToken: "reply", message: { id: "line-message", type: "text", text: "Hello" } }] })).toMatchObject([{ eventType: "inbound.message", externalEventId: "line-event", externalSubject: "U1", text: "Hello" }]);
    expect(normalizeSocialWebhook("whatsapp", { entry: [{ changes: [{ value: { messages: [{ from: "66123", id: "wa-message", timestamp: "2", type: "interactive", interactive: { button_reply: { title: "Book now" } } }], statuses: [{ recipient_id: "66123", id: "sent-1", timestamp: "3", status: "delivered" }] } }] }] })).toMatchObject([
      { eventType: "inbound.message", externalEventId: "wa-message", text: "Book now" },
      { eventType: "delivery.status", deliveryStatus: "delivered" },
    ]);
    expect(normalizeSocialWebhook("messenger", { entry: [{ messaging: [{ sender: { id: "PSID1" }, timestamp: 4, postback: { payload: "Consultation" } }] }] })).toHaveLength(1);
  });

  it("renders bounded channel-native replies and safe fallbacks", () => {
    const line = renderSocialReply("line", { recipient: "U1", replyToken: "reply", text: "Hello", quickReplies: Array.from({ length: 20 }, (_, index) => `Choice ${index}`) });
    expect(line).toMatchObject({ endpoint: "reply", body: { replyToken: "reply" } });
    const whatsapp = renderSocialReply("whatsapp", { recipient: "66123", text: "Hello", quickReplies: ["One", "Two", "Three", "Four"] });
    expect("bodies" in whatsapp && whatsapp.bodies[0]).toMatchObject({ type: "interactive" });
    const messenger = renderSocialReply("messenger", { recipient: "PSID1", text: "x".repeat(2500), quickReplies: [] });
    expect("bodies" in messenger && messenger.bodies).toHaveLength(2);
  });
});
