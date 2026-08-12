import { describe, expect, it } from "vitest";
import { deliveryPolicyFor, notificationDeliveryPolicy, notificationDeliveryPolicyStatus } from "./delivery-policy";

const lifecycleEvents = [
  "appointment.requested", "appointment.sync_failed", "callback.pending", "deal_value.recorded", "support.platform_response",
  "billing.payment.failed", "usage.allowance_90", "team.invitation_pending", "team.ownership_accepted",
  "test.flowbot_passed", "onboarding.ready", "deployment.flowbot_active", "deployment.ai_chat_disabled",
  "deployment.voice_revoked", "privacy.export_completed", "support_access.active",
];

describe("notification delivery policy", () => {
  it("is explicitly proposed and covers every current lifecycle source family", () => {
    expect(notificationDeliveryPolicyStatus).toBe("proposed");
    for (const eventKind of lifecycleEvents) expect(deliveryPolicyFor(eventKind), eventKind).not.toBeNull();
  });

  it("documents only implemented email paths and keeps in-app operational evidence required", () => {
    expect(deliveryPolicyFor("auth.verify_email")).toMatchObject({ email: "required", inApp: "not_sent" });
    expect(deliveryPolicyFor("billing.payment.failed")).toMatchObject({ email: "configurable", inApp: "required" });
    expect(deliveryPolicyFor("support.platform_response")).toMatchObject({ email: "not_sent", inApp: "required" });
    expect(deliveryPolicyFor("deployment.voice_revoked")).toMatchObject({ email: "not_sent", inApp: "required" });
  });

  it("has unique event-family keys and rejects unknown event families", () => {
    expect(new Set(notificationDeliveryPolicy.map((rule) => rule.eventFamily)).size).toBe(notificationDeliveryPolicy.length);
    expect(deliveryPolicyFor("unknown.event")).toBeNull();
  });
});
