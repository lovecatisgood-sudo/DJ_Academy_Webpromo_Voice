import { describe, expect, it } from "vitest";
import { actionRequestSchema, actionTypes } from "./index";

describe("Action Gateway contracts", () => {
  it("exposes only the seven approved action types", () => {
    expect(actionTypes).toEqual([
      "lead.create", "lead.update", "sales_fact.record", "appointment.request",
      "follow_up.create", "handover.request", "merchant_email.send",
    ]);
  });

  it("rejects arbitrary email recipients and unknown external effects", () => {
    expect(actionRequestSchema.safeParse({
      type: "merchant_email.send", idempotencyKey: "email-action-1",
      to: "arbitrary@example.test", templateKey: "lead", variables: {},
    }).success).toBe(false);
    expect(actionRequestSchema.safeParse({ type: "webhook.execute", idempotencyKey: "webhook-1" }).success).toBe(false);
  });
});
