import { randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sealJson } from "@djay/auth";
import {
  createHttpEmailDelivery, runAiChatMerchantEmail, runEmailBatch, runFlowbotMerchantEmail, type EmailDelivery, type EmailOutboxStore,
  type FlowbotMerchantEmailStore,
} from "./index";

afterEach(() => vi.unstubAllGlobals());

describe("email outbox worker", () => {
  it("opens encrypted payloads, renders an allow-listed template, and marks delivery", async () => {
    const key = randomBytes(32);
    const events: string[] = [];
    const store: EmailOutboxStore = {
      async claimBatch() { return [{ id: "job-1", topic: "auth.verify_email", attemptCount: 1, payloadCiphertext: sealJson({ template: "verify-email", to: "owner@example.test", verificationUrl: "https://app.example.test/verify?token=opaque" }, key) }]; },
      async markSent(id) { events.push(`sent:${id}`); },
      async markFailed(id) { events.push(`failed:${id}`); },
    };
    const delivery: EmailDelivery = { async send(message, idempotencyKey) { events.push(`deliver:${message.to}:${message.subject}:${idempotencyKey}`); } };
    await expect(runEmailBatch(store, delivery, key)).resolves.toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(events).toEqual(["deliver:owner@example.test:ยืนยันบัญชี DJAY Bot:job-1", "sent:job-1"]);
  });

  it("records a bounded error code without exposing payload data", async () => {
    const key = randomBytes(32);
    let failure = "";
    const store: EmailOutboxStore = {
      async claimBatch() { return [{ id: "job-2", topic: "auth.verify_email", attemptCount: 8, payloadCiphertext: "invalid" }]; },
      async markSent() {},
      async markFailed(_id, _now, code, _retryAt, deadLetter) { failure = `${code}:${deadLetter}`; },
    };
    await expect(runEmailBatch(store, { async send() {} }, key)).resolves.toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(failure).toBe("delivery_failed:true");
  });
});

describe("HTTP email delivery", () => {
  it("reuses the durable outbox ID as the provider idempotency key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal("fetch", fetchMock);
    const delivery = createHttpEmailDelivery({
      endpoint: "https://email.example.test/messages",
      apiToken: "test-email-token-value",
      from: "DJAY Bot <no-reply@example.test>",
    });
    const message = { to: "owner@example.test", subject: "Test", text: "Test", html: "<p>Test</p>" };
    await delivery.send(message, "durable-outbox-id");
    await delivery.send(message, "durable-outbox-id");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    for (const call of fetchMock.mock.calls) {
      expect(call[1]?.headers).toMatchObject({ "Idempotency-Key": "durable-outbox-id" });
    }
  });
});

describe("AI Chat merchant email worker", () => {
  it("renders only the fixed qualified-lead template from an encrypted recipient", async () => {
    const key = randomBytes(32); const events: string[] = [];
    const store: FlowbotMerchantEmailStore = {
      async claim() { return {
        id: "ai-outbox-1", recipientCiphertext: sealJson({ email: "sales@example.test" }, key),
        payload: {
          notificationProfileId: "11111111-1111-4111-8111-111111111111",
          templateKey: "ai_chat.lead_qualified",
          leadId: "22222222-2222-4222-8222-222222222222",
          contactId: "33333333-3333-4333-8333-333333333333",
          turnId: "44444444-4444-4444-8444-444444444444",
        }, attemptCount: 1, deliveryAllowed: true,
      }; },
      async finish(id, delivered, code, deadLetter) { events.push(`finish:${id}:${delivered}:${code}:${deadLetter}`); },
    };
    await expect(runAiChatMerchantEmail(store, {
      async send(message) { events.push(`deliver:${message.to}:${message.subject}`); },
    }, key)).resolves.toMatchObject({ status: "sent", outboxId: "ai-outbox-1" });
    expect(events).toEqual([
      "deliver:sales@example.test:ผู้สนใจที่ผ่านการคัดกรองจาก DJAY Bot",
      "finish:ai-outbox-1:true:null:false",
    ]);
  });
});

describe("FlowBot merchant email worker", () => {
  it("decrypts only the recipient and renders the fixed lead-captured template", async () => {
    const key = randomBytes(32);
    const events: string[] = [];
    const store: FlowbotMerchantEmailStore = {
      async claim() {
        return {
          id: "outbox-1", recipientCiphertext: sealJson({ email: "merchant@example.test" }, key),
          payload: {
            notificationProfileId: "11111111-1111-4111-8111-111111111111",
            templateKey: "flowbot.lead_captured",
            leadId: "22222222-2222-4222-8222-222222222222",
            contactId: "33333333-3333-4333-8333-333333333333",
          },
          attemptCount: 1, deliveryAllowed: true,
        };
      },
      async finish(id, delivered, code, deadLetter) { events.push(`finish:${id}:${delivered}:${code}:${deadLetter}`); },
    };
    const delivery: EmailDelivery = {
      async send(message) { events.push(`deliver:${message.to}:${message.subject}:${message.text}`); },
    };
    await expect(runFlowbotMerchantEmail(store, delivery, key)).resolves.toMatchObject({ status: "sent", outboxId: "outbox-1" });
    expect(events).toEqual([
      "deliver:merchant@example.test:DJAY Bot เก็บข้อมูลผู้สนใจรายใหม่จากเว็บไซต์แล้ว:มีผู้สนใจรายใหม่จากเว็บไซต์ รหัสผู้สนใจ: 22222222-2222-4222-8222-222222222222",
      "finish:outbox-1:true:null:false",
    ]);
  });

  it("dead-letters a disabled profile without delivering", async () => {
    const store: FlowbotMerchantEmailStore = {
      async claim() { return { id: "outbox-2", recipientCiphertext: null, payload: {}, attemptCount: 1, deliveryAllowed: false }; },
      async finish(_id, _delivered, code, deadLetter) { expect([code, deadLetter]).toEqual(["notification_profile_disabled", true]); },
    };
    let delivered = false;
    const result = await runFlowbotMerchantEmail(store, { async send() { delivered = true; } }, randomBytes(32));
    expect(result.status).toBe("dead_letter");
    expect(delivered).toBe(false);
  });
});
