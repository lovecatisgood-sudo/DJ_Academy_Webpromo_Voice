import { describe, expect, it } from "vitest";
import { canTransitionSubscription, signWebhook, verifySignedWebhook } from "./index";

describe("billing primitives", () => {
  it("enforces explicit subscription transitions", () => {
    expect(canTransitionSubscription("pending", "active")).toBe(true);
    expect(canTransitionSubscription("cancelled", "active")).toBe(false);
    expect(canTransitionSubscription("active", "pending")).toBe(false);
  });

  it("verifies a timestamped webhook and rejects tampering and stale delivery", () => {
    const secret = Buffer.from("01234567890123456789012345678901");
    const now = new Date("2026-07-14T12:00:00Z");
    const timestamp = Math.floor(now.getTime() / 1000);
    const rawBody = JSON.stringify({ id: "event-1", type: "subscription.active", occurredAt: now.toISOString(), data: { ref: "sub-1" } });
    const signature = signWebhook(rawBody, timestamp, secret);
    expect(verifySignedWebhook({ rawBody, timestampHeader: String(timestamp), signatureHeader: signature, secret, now }).externalEventId).toBe("event-1");
    expect(() => verifySignedWebhook({ rawBody: `${rawBody} `, timestampHeader: String(timestamp), signatureHeader: signature, secret, now })).toThrow();
    expect(() => verifySignedWebhook({ rawBody, timestampHeader: String(timestamp - 301), signatureHeader: signature, secret, now })).toThrow();
  });
});
