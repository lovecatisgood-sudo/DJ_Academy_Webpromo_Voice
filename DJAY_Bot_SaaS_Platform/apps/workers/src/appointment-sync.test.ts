import { describe, expect, it } from "vitest";
import { appointmentSyncErrorCode, appointmentSyncPayload } from "./appointment-sync";

const claim = {
  job_id: "11111111-1111-4111-8111-111111111111", tenant_id: "22222222-2222-4222-8222-222222222222",
  appointment_request_id: "33333333-3333-4333-8333-333333333333", operation: "create" as const,
  provider_kind: "google_calendar" as const, config_ciphertext: "sealed", start_at: new Date("2026-08-20T03:00:00Z"),
  end_at: new Date("2026-08-20T04:00:00Z"), timezone: "Asia/Bangkok", external_event_ref: null, attempt_count: 1,
};

describe("appointment calendar synchronization", () => {
  it("builds a bounded provider payload without contact or conversation content", () => {
    const payload = appointmentSyncPayload(claim);
    expect(payload).toMatchObject({ operation: "create", timezone: "Asia/Bangkok", startAt: "2026-08-20T03:00:00.000Z" });
    expect(JSON.stringify(payload)).not.toMatch(/contact|email|phone|message|leadTitle/i);
  });

  it("normalizes provider errors without leaking arbitrary exception text", () => {
    expect(appointmentSyncErrorCode(new Error("calendar_timeout"))).toBe("calendar_timeout");
    expect(appointmentSyncErrorCode(new Error("Bearer secret-value"))).toBe("calendar_delivery_failed");
  });
});
