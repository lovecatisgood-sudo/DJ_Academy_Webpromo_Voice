import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { AppointmentSyncWorkerStore } from "./appointment-sync-store";
import { createDatabaseClient } from "./client";
import { SharedDomainStore } from "./shared-domain-store";

const workerUrl = process.env.WORKER_DATABASE_URL; const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL; const enabled = Boolean(workerUrl && tenantUrl && adminUrl);
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
afterAll(async () => { await workerClient?.end(); await tenantClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("appointment calendar reconciliation", () => {
  it("keeps local state separate from provider-confirmed create, reschedule, cancel, retry, and immutable attempts", async () => {
    const tenantId = randomUUID(); const userId = randomUUID(); const membershipId = randomUUID();
    const contactId = randomUUID(); const leadId = randomUUID(); const appointmentId = randomUUID();
    const firstOptionId = randomUUID(); const secondOptionId = randomUUID(); const profileId = randomUUID();
    await adminClient!.begin(async (sql) => {
      await sql`INSERT INTO identity.users (id, display_name, status) VALUES (${userId}::uuid, 'Calendar Owner', 'active')`;
      await sql`INSERT INTO tenancy.tenants (id, slug, business_name) VALUES (${tenantId}::uuid, ${`calendar-${tenantId.slice(0, 8)}`}, 'Calendar Test')`;
      await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${userId}::uuid, 'tenant_master_admin', 'active', now())`;
      await sql`INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
        VALUES (${contactId}::uuid, ${tenantId}::uuid, 'Calendar Customer', 'en')`;
      await sql`INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
        VALUES (${leadId}::uuid, ${tenantId}::uuid, ${contactId}::uuid, 'Calendar consultation', 'integration_test')`;
      await sql`INSERT INTO tenancy.appointment_requests (id, tenant_id, lead_id, timezone, idempotency_key)
        VALUES (${appointmentId}::uuid, ${tenantId}::uuid, ${leadId}::uuid, 'Asia/Bangkok', ${`calendar-request-${appointmentId}`})`;
      await sql`INSERT INTO tenancy.appointment_time_options
        (id, tenant_id, appointment_request_id, start_at, end_at, preference_order, source, verification_status)
        VALUES
        (${firstOptionId}::uuid, ${tenantId}::uuid, ${appointmentId}::uuid, now() + interval '2 days', now() + interval '2 days 1 hour', 1, 'customer', 'confirmed'),
        (${secondOptionId}::uuid, ${tenantId}::uuid, ${appointmentId}::uuid, now() + interval '3 days', now() + interval '3 days 1 hour', 2, 'customer', 'unavailable')`;
      await sql`INSERT INTO tenancy.voice_scheduling_profiles
        (id, tenant_id, name, provider_kind, config_ciphertext, created_by_membership_id)
        VALUES (${profileId}::uuid, ${tenantId}::uuid, 'Primary calendar', 'google_calendar', 'sealed-config-that-is-long-enough', ${membershipId}::uuid)`;
      await sql`UPDATE tenancy.appointment_requests SET status = 'confirmed', updated_at = now() WHERE id = ${appointmentId}::uuid`;
    });

    const worker = new AppointmentSyncWorkerStore(workerClient!); const create = await worker.claim();
    expect(create).toMatchObject({ tenant_id: tenantId, appointment_request_id: appointmentId, operation: "create", external_event_ref: null, attempt_count: 1 });
    await adminClient!.begin(async (sql) => {
      await sql`UPDATE tenancy.appointment_time_options SET verification_status = CASE WHEN id = ${secondOptionId}::uuid THEN 'confirmed' ELSE 'unavailable' END
        WHERE tenant_id = ${tenantId}::uuid AND appointment_request_id = ${appointmentId}::uuid`;
      await sql`UPDATE tenancy.appointment_requests SET status = 'rescheduled', updated_at = now() WHERE id = ${appointmentId}::uuid`;
    });
    await expect(worker.claim()).resolves.toBeNull();
    expect(await worker.finish(create!.job_id, { succeeded: true, externalEventRef: "google-event-1" })).toBe(true);
    expect(await worker.finish(create!.job_id, { succeeded: true, externalEventRef: "duplicate" })).toBe(false);
    const update = await worker.claim();
    expect(update).toMatchObject({ tenant_id: tenantId, operation: "update", external_event_ref: "google-event-1", attempt_count: 1 });
    expect(await worker.finish(update!.job_id, { succeeded: false, safeErrorCode: "calendar_timeout" })).toBe(true);
    await adminClient!`UPDATE tenancy.voice_scheduling_jobs SET available_at = now() WHERE id = ${update!.job_id}::uuid`;
    const retry = await worker.claim(); expect(retry).toMatchObject({ job_id: update!.job_id, attempt_count: 2 });
    expect(await worker.finish(retry!.job_id, { succeeded: true, externalEventRef: "google-event-1" })).toBe(true);

    const context = createTenantContext({ tenantId, userId, membershipId, sessionId: randomUUID(), role: "tenant_master_admin", requestId: randomUUID() });
    const sharedDomain = new SharedDomainStore(tenantClient!);
    await expect(sharedDomain.updateAppointment(context, appointmentId, {
      status: "rescheduled", optionId: firstOptionId, notes: "Customer requested another time",
    })).resolves.toEqual({ status: "accepted", replayed: false });
    const repeatedUpdate = await worker.claim();
    expect(repeatedUpdate).toMatchObject({ tenant_id: tenantId, operation: "update", external_event_ref: "google-event-1", attempt_count: 1 });
    expect(await worker.finish(repeatedUpdate!.job_id, { succeeded: true, externalEventRef: "google-event-1" })).toBe(true);
    await expect(sharedDomain.updateAppointment(context, appointmentId, {
      status: "rescheduled", optionId: firstOptionId,
    })).resolves.toEqual({ status: "accepted", replayed: true });
    await expect(worker.claim()).resolves.toBeNull();

    await adminClient!`UPDATE tenancy.appointment_requests SET status = 'cancelled', updated_at = now() WHERE id = ${appointmentId}::uuid`;
    const cancel = await worker.claim();
    expect(cancel).toMatchObject({ tenant_id: tenantId, operation: "cancel", external_event_ref: "google-event-1" });
    expect(await worker.finish(cancel!.job_id, { succeeded: true, externalEventRef: "google-event-1" })).toBe(true);
    await expect(worker.claim()).resolves.toBeNull();

    const listed = await sharedDomain.listAppointments(context);
    expect(listed).toHaveLength(1); expect(listed[0]).toMatchObject({ id: appointmentId, status: "cancelled", calendarSyncStatus: "synchronized", calendarSyncOperation: "cancel" });
    const evidence = await adminClient!<{ attempts: number; notifications: number; refsExposed: boolean }[]>`SELECT
      (SELECT count(*)::int FROM tenancy.appointment_sync_attempts WHERE tenant_id = ${tenantId}::uuid) AS attempts,
      (SELECT count(*)::int FROM tenancy.tenant_notifications WHERE tenant_id = ${tenantId}::uuid AND event_kind LIKE 'appointment.sync_%') AS notifications,
      EXISTS (SELECT 1 FROM tenancy.appointment_sync_attempts WHERE tenant_id = ${tenantId}::uuid AND external_reference_sha256 IS NULL AND outcome = 'succeeded') AS "refsExposed"`;
    expect(evidence[0]).toEqual({ attempts: 5, notifications: 5, refsExposed: false });
    await expect(adminClient!`UPDATE tenancy.appointment_sync_attempts SET outcome = 'failed' WHERE tenant_id = ${tenantId}::uuid`).rejects.toThrow(/immutable/);
  });
});
