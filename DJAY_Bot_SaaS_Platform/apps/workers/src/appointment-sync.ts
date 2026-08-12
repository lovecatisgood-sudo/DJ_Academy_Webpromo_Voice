import { openJson } from "@djay/auth";
import type { AppointmentSyncClaim } from "@djay/db";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { JWT } from "google-auth-library";
import { z } from "zod";

const googleConfigSchema = z.object({
  calendarId: z.string().trim().min(3).max(500), serviceAccountEmail: z.email(),
  privateKey: z.string().min(100).max(10_000),
}).strict();
const webhookConfigSchema = z.object({
  endpoint: z.url(), bearerToken: z.string().min(16).max(4096).optional(),
}).strict();
const webhookResponseSchema = z.object({ externalEventRef: z.string().min(1).max(1000).optional() }).strict();

function isPublicAddress(address: string) {
  const family = isIP(address);
  if (family === 4) {
    const [a = 0, b = 0] = address.split(".").map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127)
      || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
      || (a === 198 && (b === 18 || b === 19)));
  }
  if (family === 6) {
    const normalized = address.toLowerCase();
    return normalized !== "::" && normalized !== "::1" && !normalized.startsWith("fc") && !normalized.startsWith("fd")
      && !/^fe[89ab]/.test(normalized) && !normalized.startsWith("::ffff:");
  }
  return false;
}

export function appointmentSyncPayload(claim: AppointmentSyncClaim) {
  return Object.freeze({
    schemaVersion: "djay.appointment.sync.v1", idempotencyKey: claim.job_id,
    tenantId: claim.tenant_id, appointmentRequestId: claim.appointment_request_id,
    operation: claim.operation, externalEventRef: claim.external_event_ref,
    startAt: claim.start_at?.toISOString() ?? null, endAt: claim.end_at?.toISOString() ?? null,
    timezone: claim.timezone,
  });
}

async function deliverWebhook(claim: AppointmentSyncClaim, configValue: unknown) {
  const config = webhookConfigSchema.parse(configValue); const url = new URL(config.endpoint);
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) throw new Error("calendar_endpoint_policy_rejected");
  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((item) => !isPublicAddress(item.address))) throw new Error("calendar_endpoint_address_rejected");
  const selected = addresses[0]!; const body = JSON.stringify(appointmentSyncPayload(claim));
  return new Promise<string>((resolve, reject) => {
    const outbound = request(url, { method: "POST", timeout: 8_000,
      headers: { "content-type": "application/json", "content-length": Buffer.byteLength(body),
        "user-agent": "DJAY-Appointment-Sync/1.0", "x-djay-idempotency-key": claim.job_id,
        ...(config.bearerToken ? { authorization: `Bearer ${config.bearerToken}` } : {}) },
      lookup: (_hostname, _options, callback) => callback(null, selected.address, selected.family),
    }, (response) => {
      const chunks: Buffer[] = []; let bytes = 0;
      response.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 64 * 1024) response.destroy(new Error("calendar_response_too_large")); else chunks.push(chunk); });
      response.on("end", () => {
        if ((response.statusCode ?? 500) < 200 || (response.statusCode ?? 500) >= 300) return reject(new Error("calendar_http_rejected"));
        try {
          const parsed = webhookResponseSchema.parse(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {});
          const externalRef = parsed.externalEventRef ?? claim.external_event_ref;
          if (!externalRef) throw new Error("calendar_external_reference_missing");
          resolve(externalRef);
        } catch (error) { reject(error); }
      });
      response.on("error", reject);
    });
    outbound.on("timeout", () => outbound.destroy(new Error("calendar_timeout")));
    outbound.on("error", reject); outbound.end(body);
  });
}

async function deliverGoogleCalendar(claim: AppointmentSyncClaim, configValue: unknown) {
  const config = googleConfigSchema.parse(configValue);
  const auth = new JWT({ email: config.serviceAccountEmail, key: config.privateKey.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/calendar.events"] });
  const base = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(config.calendarId)}/events`;
  if (claim.operation === "cancel") {
    if (!claim.external_event_ref) throw new Error("calendar_external_reference_missing");
    await auth.request({ url: `${base}/${encodeURIComponent(claim.external_event_ref)}`, method: "DELETE", params: { sendUpdates: "all" } });
    return claim.external_event_ref;
  }
  if (!claim.start_at || !claim.end_at) throw new Error("calendar_time_missing");
  const data = { summary: "DJAY customer appointment", description: `DJAY appointment ${claim.appointment_request_id}`,
    start: { dateTime: claim.start_at.toISOString(), timeZone: claim.timezone },
    end: { dateTime: claim.end_at.toISOString(), timeZone: claim.timezone },
    extendedProperties: { private: { djayAppointmentId: claim.appointment_request_id, djayIdempotencyKey: claim.job_id } } };
  const response = claim.operation === "create"
    ? await auth.request<{ id?: string }>({ url: base, method: "POST", params: { sendUpdates: "all" }, data })
    : await auth.request<{ id?: string }>({ url: `${base}/${encodeURIComponent(claim.external_event_ref ?? "")}`, method: "PATCH", params: { sendUpdates: "all" }, data });
  const externalRef = response.data.id ?? claim.external_event_ref;
  if (!externalRef) throw new Error("calendar_external_reference_missing");
  return externalRef;
}

export async function deliverAppointmentSync(claim: AppointmentSyncClaim, envelopeKey: Buffer) {
  const config = openJson<unknown>(claim.config_ciphertext, envelopeKey);
  return claim.provider_kind === "google_calendar"
    ? deliverGoogleCalendar(claim, config) : deliverWebhook(claim, config);
}

export function appointmentSyncErrorCode(error: unknown) {
  if (error instanceof z.ZodError) return "calendar_configuration_invalid";
  const message = error instanceof Error ? error.message : "calendar_delivery_failed";
  return /^[a-z0-9_]{2,100}$/.test(message) ? message : "calendar_delivery_failed";
}
