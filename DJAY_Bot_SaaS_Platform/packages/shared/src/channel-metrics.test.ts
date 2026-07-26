import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  channelMetricNames, deliveryErrorClass, emitChannelDeliveryResult, emitConversationFirstResponse,
  emitLineReplyWindowHit, emitOnboardingStep, emitWebhookAck, lineReplyWindowMs,
} from "./channel-metrics";

let emitted: Record<string, unknown>[] = [];

beforeEach(() => {
  emitted = [];
  vi.spyOn(console, "info").mockImplementation((line: unknown) => {
    emitted.push(JSON.parse(String(line)) as Record<string, unknown>);
  });
});
afterEach(() => { vi.restoreAllMocks(); });

const only = () => {
  expect(emitted).toHaveLength(1);
  return emitted[0]!;
};

describe("channel metric transport", () => {
  it("uses the existing commerce_metric structured-log shape", () => {
    emitWebhookAck({ product: "flowbot", channel: "line", elapsedMs: 42.6, httpStatus: 200 });
    expect(only()).toEqual({
      severity: "INFO", message: "commerce_metric", metric: "webhook_ack_ms",
      product: "flowbot", channel: "line", elapsedMs: 43, httpStatus: 200,
    });
  });

  it("never throws into the request path when logging itself fails", () => {
    vi.spyOn(console, "info").mockImplementation(() => { throw new Error("stdout closed"); });
    expect(() => emitWebhookAck({ product: "flowbot", channel: "line", elapsedMs: 1, httpStatus: 200 })).not.toThrow();
    expect(() => emitChannelDeliveryResult({ product: "flowbot", channel: "line", outcome: "succeeded" })).not.toThrow();
  });

  it("declares exactly the five metrics the SLO runbook requires", () => {
    expect([...channelMetricNames]).toEqual([
      "conversation_first_response_ms", "webhook_ack_ms", "channel_delivery_result",
      "line_reply_window_hit", "onboarding_step",
    ]);
  });
});

describe("conversation_first_response_ms", () => {
  it("carries product and channel labels and a non-negative integer", () => {
    emitConversationFirstResponse({ product: "ai_chat", channel: "whatsapp", elapsedMs: 1234.7 });
    expect(only()).toMatchObject({
      metric: "conversation_first_response_ms", product: "ai_chat", channel: "whatsapp", elapsedMs: 1235,
    });
    emitted = [];
    emitConversationFirstResponse({ product: "flowbot", channel: "line", elapsedMs: -5 });
    expect(only()).toMatchObject({ elapsedMs: 0 });
  });
});

describe("channel_delivery_result", () => {
  it("labels a success with no error class", () => {
    emitChannelDeliveryResult({ product: "flowbot", channel: "line", outcome: "succeeded", attemptCount: 1 });
    expect(only()).toMatchObject({
      metric: "channel_delivery_result", product: "flowbot", channel: "line",
      outcome: "succeeded", errorClass: null, deadLetter: false, attemptCount: 1,
    });
  });

  it("still emits on a failed delivery, with our own error class", () => {
    emitChannelDeliveryResult({
      product: "flowbot", channel: "line", outcome: "failed",
      errorClass: deliveryErrorClass("credential_reauthorization_required"), deadLetter: true, attemptCount: 4,
    });
    expect(only()).toMatchObject({
      metric: "channel_delivery_result", outcome: "failed",
      errorClass: "reauthorization_required", deadLetter: true, attemptCount: 4,
    });
  });

  it("maps internal codes to a provider-neutral class and never echoes provider text", () => {
    expect(deliveryErrorClass("channel_rate_limited")).toBe("rate_limited");
    expect(deliveryErrorClass("line_rate_limited")).toBe("rate_limited");
    expect(deliveryErrorClass("flow_social_authority_unavailable")).toBe("authority_unavailable");
    expect(deliveryErrorClass("channel_delivery_failed")).toBe("transport_failed");
    expect(deliveryErrorClass("invalid_social_render")).toBe("invalid_request");
    expect(deliveryErrorClass(null)).toBe("unknown");
    // An unrecognised string is classified, never passed through.
    expect(deliveryErrorClass("Meta returned OAuthException for user 12345")).toBe("unknown");
  });
});

describe("line_reply_window_hit", () => {
  it("is a hit inside the free reply window when the reply token was used", () => {
    emitLineReplyWindowHit({ product: "flowbot", elapsedMs: 5_000, usedReplyToken: true });
    expect(only()).toMatchObject({
      metric: "line_reply_window_hit", product: "flowbot", channel: "line",
      hit: true, elapsedMs: 5_000, usedReplyToken: true,
    });
  });

  it("is a miss past the window, because the reply became a metered push", () => {
    emitLineReplyWindowHit({ product: "flowbot", elapsedMs: lineReplyWindowMs + 1, usedReplyToken: true });
    expect(only()).toMatchObject({ hit: false, usedReplyToken: true });
  });

  it("is a miss whenever no reply token was available, however fast we were", () => {
    emitLineReplyWindowHit({ product: "ai_chat", elapsedMs: 10, usedReplyToken: false });
    expect(only()).toMatchObject({ hit: false, elapsedMs: 10, usedReplyToken: false });
  });

  it("treats the window boundary itself as a hit", () => {
    emitLineReplyWindowHit({ product: "flowbot", elapsedMs: lineReplyWindowMs, usedReplyToken: true });
    expect(only()).toMatchObject({ hit: true });
  });
});

describe("onboarding_step", () => {
  it("labels channel, step and outcome, with a reason only on failure", () => {
    emitOnboardingStep({ product: "flowbot", channel: "line", step: "mint", outcome: "succeeded" });
    expect(only()).toMatchObject({
      metric: "onboarding_step", product: "flowbot", channel: "line",
      step: "mint", outcome: "succeeded", reason: null,
    });
    emitted = [];
    emitOnboardingStep({
      product: "flowbot", channel: "line", step: "test_webhook",
      outcome: "failed", reason: "webhook_unreachable",
    });
    expect(only()).toMatchObject({ step: "test_webhook", outcome: "failed", reason: "webhook_unreachable" });
  });
});

describe("payload confidentiality", () => {
  it("emits only declared low-cardinality fields — no PII, tokens, bodies, or provider names", () => {
    emitWebhookAck({ product: "flowbot", channel: "line", elapsedMs: 10, httpStatus: 200 });
    emitConversationFirstResponse({ product: "flowbot", channel: "line", elapsedMs: 10 });
    emitChannelDeliveryResult({ product: "flowbot", channel: "line", outcome: "failed", errorClass: "rate_limited" });
    emitLineReplyWindowHit({ product: "flowbot", elapsedMs: 10, usedReplyToken: true });
    emitOnboardingStep({ product: "flowbot", channel: "line", step: "mint", outcome: "succeeded" });

    const allowed = new Set([
      "severity", "message", "metric", "product", "channel", "elapsedMs", "httpStatus",
      "outcome", "errorClass", "deadLetter", "attemptCount", "hit", "usedReplyToken", "step", "reason",
    ]);
    for (const payload of emitted) {
      // The key allowlist is the real guarantee: there is no field through which a
      // body, identifier, or credential could travel. `usedReplyToken` is a boolean
      // flag, not a token, so values are scanned separately from key names.
      for (const key of Object.keys(payload)) expect(allowed).toContain(key);
      const values = Object.values(payload).map((value) => String(value).toLowerCase()).join(" ");
      for (const forbidden of ["token", "secret", "recipient", "userid", "tenant", "openai", "anthropic", "gemini", "facebook"]) {
        expect(values).not.toContain(forbidden);
      }
      for (const value of Object.values(payload)) {
        expect(["string", "number", "boolean", "object"]).toContain(typeof value);
        if (typeof value === "string") expect(value.length).toBeLessThanOrEqual(64);
      }
    }
  });
});
