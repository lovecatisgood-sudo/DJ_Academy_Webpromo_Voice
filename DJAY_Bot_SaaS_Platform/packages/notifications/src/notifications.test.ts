import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { sealJson } from "@djay/auth";
import {
  runAiChatMerchantEmail, runEmailBatch, runFlowbotMerchantEmail, type EmailDelivery, type EmailOutboxStore,
  type FlowbotMerchantEmailStore,
} from "./index";

describe("email outbox worker", () => {
  it("opens encrypted payloads, renders an allow-listed template, and marks delivery", async () => {
    const key = randomBytes(32);
    const events: string[] = [];
    const store: EmailOutboxStore = {
      async claimBatch() { return [{ id: "job-1", topic: "auth.verify_email", attemptCount: 1, payloadCiphertext: sealJson({ template: "verify-email", to: "owner@example.test", verificationUrl: "https://app.example.test/verify?token=opaque" }, key) }]; },
      async markSent(id) { events.push(`sent:${id}`); },
      async markFailed(id) { events.push(`failed:${id}`); },
    };
    const delivery: EmailDelivery = { async send(message) { events.push(`deliver:${message.to}:${message.subject}`); } };
    await expect(runEmailBatch(store, delivery, key)).resolves.toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(events).toEqual(["deliver:owner@example.test:Verify your DJAY Bot account", "sent:job-1"]);
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
      "deliver:sales@example.test:Qualified website lead from DJAY Bot",
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
      "deliver:merchant@example.test:New website lead captured by DJAY Bot:A new website lead was captured. Lead ID: 22222222-2222-4222-8222-222222222222",
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
