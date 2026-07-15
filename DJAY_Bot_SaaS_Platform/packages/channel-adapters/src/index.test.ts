import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createSocialDeliveryClient, normalizeSocialWebhook, renderSocialReply, SocialDeliveryError, verifySocialChallenge, verifySocialSignature } from "./index";

const lineCredentials = { channel: "line" as const, channelAccessToken: "token-token-token-token", channelSecret: "secret-secret-secret-secret" };
const whatsappCredentials = { channel: "whatsapp" as const, accessToken: "token-token-token-token", appSecret: "secret-secret-secret-secret", verifyToken: "verify-verify-verify", phoneNumberId: "phone-1", businessAccountId: "business-1" };
const messengerCredentials = { channel: "messenger" as const, pageAccessToken: "page-token-token-token", appSecret: "secret-secret-secret-secret", verifyToken: "verify-verify-verify", pageId: "page-1" };

describe("social channel adapters", () => {
  it("verifies LINE and Meta signatures over the untouched body", () => {
    const body = Buffer.from('{"events":[]}');
    const lineSignature = createHmac("sha256", lineCredentials.channelSecret).update(body).digest("base64");
    const metaSignature = `sha256=${createHmac("sha256", whatsappCredentials.appSecret).update(body).digest("hex")}`;
    expect(verifySocialSignature("line", body, lineSignature, lineCredentials)).toBe(true);
    expect(verifySocialSignature("whatsapp", body, metaSignature, whatsappCredentials)).toBe(true);
    expect(verifySocialSignature("messenger", body, metaSignature, messengerCredentials)).toBe(true);
    expect(verifySocialSignature("whatsapp", Buffer.from("changed"), metaSignature, whatsappCredentials)).toBe(false);
    expect(verifySocialChallenge("whatsapp", "subscribe", "verify-verify-verify", "123", whatsappCredentials)).toBe("123");
    expect(verifySocialChallenge("messenger", "subscribe", "verify-verify-verify", "456", messengerCredentials)).toBe("456");
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

  it("delivers LINE replies only through the configured HTTPS gateway", async () => {
    const requests: { url: string; authorization: string | null; body: unknown }[] = [];
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async (input, init) => {
        requests.push({
          url: String(input), authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null,
        });
        return new Response(JSON.stringify({ sentMessages: [{ id: "line-message-1" }] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("line", {
      recipient: "U1", replyToken: "reply-token", text: "Hello", quickReplies: ["Book"],
    });
    await expect(client.deliver("line", lineCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["line-message-1"],
      deliveredCount: 1,
    });
    expect(requests).toEqual([expect.objectContaining({
      url: "https://api.line.test/v2/bot/message/reply",
      authorization: `Bearer ${lineCredentials.channelAccessToken}`,
      body: expect.objectContaining({ replyToken: "reply-token" }),
    })]);
  });

  it("delivers WhatsApp service-window replies to the configured phone number only", async () => {
    const requests: { url: string; authorization: string | null; body: unknown }[] = [];
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ messages: [{ id: "wamid.outbound-1" }] }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("whatsapp", {
      recipient: "66810000000", text: "Hello", quickReplies: ["Book"],
    });
    await expect(client.deliver("whatsapp", whatsappCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["wamid.outbound-1"],
      deliveredCount: 1,
    });
    expect(requests).toEqual([expect.objectContaining({
      url: "https://graph.meta.test/v23.0/phone-1/messages",
      authorization: `Bearer ${whatsappCredentials.accessToken}`,
      body: expect.objectContaining({ messaging_product: "whatsapp", to: "66810000000" }),
    })]);
  });

  it("reports durable WhatsApp progress when a later message part fails", async () => {
    let requestCount = 0;
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async () => {
        requestCount += 1;
        if (requestCount === 1) {
          return new Response(JSON.stringify({ messages: [{ id: "wamid.part-1" }] }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ error: { message: "limited" } }), {
          status: 429, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("whatsapp", {
      recipient: "66810000000", text: "x".repeat(5000), quickReplies: [],
    });
    await expect(client.deliver("whatsapp", whatsappCredentials, rendered)).rejects.toMatchObject({
      name: "SocialDeliveryError", message: "channel_rate_limited",
      attemptedCount: 2, deliveredCount: 1, externalMessageIds: ["wamid.part-1"],
    } satisfies Partial<SocialDeliveryError>);
  });

  it("delivers Messenger replies through the configured Page token", async () => {
    const requests: { url: string; authorization: string | null; body: unknown }[] = [];
    const client = createSocialDeliveryClient({
      lineApiBaseUrl: "https://api.line.test/", metaGraphBaseUrl: "https://graph.meta.test/v23.0/",
      fetchImpl: async (input, init) => {
        requests.push({ url: String(input), authorization: new Headers(init?.headers).get("authorization"),
          body: init?.body ? JSON.parse(String(init.body)) : null });
        return new Response(JSON.stringify({ message_id: "mid.outbound-1" }), {
          status: 200, headers: { "Content-Type": "application/json" },
        });
      },
    });
    const rendered = renderSocialReply("messenger", {
      recipient: "PSID1", text: "Hello", quickReplies: ["Book"],
    });
    await expect(client.deliver("messenger", messengerCredentials, rendered)).resolves.toEqual({
      externalMessageIds: ["mid.outbound-1"], deliveredCount: 1,
    });
    expect(requests).toEqual([expect.objectContaining({
      url: "https://graph.meta.test/v23.0/me/messages",
      authorization: `Bearer ${messengerCredentials.pageAccessToken}`,
      body: expect.objectContaining({ recipient: { id: "PSID1" }, messaging_type: "RESPONSE" }),
    })]);
  });
});
