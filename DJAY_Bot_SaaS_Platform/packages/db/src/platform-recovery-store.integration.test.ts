import { randomUUID } from "node:crypto";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { AppointmentSyncWorkerStore } from "./appointment-sync-store";
import { PostgresEmailOutboxStore } from "./email-outbox-store";
import { PlatformRecoveryStore } from "./platform-recovery-store";

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(platformUrl && adminUrl && workerUrl);
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;

afterAll(async () => { await platformClient?.end(); await adminClient?.end(); await workerClient?.end(); });

describe.runIf(enabled)("P9 reviewed dead-letter recovery", () => {
  it("reveals only safe metadata and requires a different owner before one idempotent retry", async () => {
    const requesterOwnerId = randomUUID();
    const reviewerOwnerId = randomUUID();
    const supportId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES
        (${requesterOwnerId}::uuid, ${`recovery-owner-a-${requesterOwnerId}@example.test`}, 'Recovery owner A', 'unused', 'active'),
        (${reviewerOwnerId}::uuid, ${`recovery-owner-b-${reviewerOwnerId}@example.test`}, 'Recovery owner B', 'unused', 'active'),
        (${supportId}::uuid, ${`recovery-support-${supportId}@example.test`}, 'Recovery support', 'unused', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.role_assignments (platform_user_id, role, granted_by_user_id)
      VALUES
        (${requesterOwnerId}::uuid, 'platform_owner', NULL),
        (${reviewerOwnerId}::uuid, 'platform_owner', ${requesterOwnerId}::uuid),
        (${supportId}::uuid, 'platform_support', ${requesterOwnerId}::uuid)
    `;
    const itemId = randomUUID();
    const excludedId = randomUUID();
    const calendarJobId = randomUUID(); const tenantId = randomUUID(); const tenantUserId = randomUUID();
    const membershipId = randomUUID(); const contactId = randomUUID(); const leadId = randomUUID();
    const appointmentId = randomUUID(); const optionId = randomUUID(); const profileId = randomUUID();
    await adminClient!`
      INSERT INTO operations.outbox (
        id, topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key,
        status, attempt_count, processed_at, last_error_code
      ) VALUES
        (${itemId}::uuid, 'auth.verify_email', 'user', ${randomUUID()}::uuid,
          'secret-recipient-and-token', ${`recovery:${itemId}`}, 'dead_letter', 8, now(), 'delivery_rejected'),
        (${excludedId}::uuid, 'unsafe.external_effect', 'test', ${randomUUID()}::uuid,
          'must-never-appear', ${`excluded:${excludedId}`}, 'dead_letter', 2, now(), 'ambiguous_ack')
    `;
    await adminClient!.begin(async (sql) => {
      await sql`INSERT INTO identity.users (id, display_name, status) VALUES (${tenantUserId}::uuid, 'Recovery tenant owner', 'active')`;
      await sql`INSERT INTO tenancy.tenants (id, slug, business_name) VALUES (${tenantId}::uuid, ${`recovery-${tenantId.slice(0, 8)}`}, 'Recovery Calendar')`;
      await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${tenantUserId}::uuid, 'tenant_master_admin', 'active', now())`;
      await sql`INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
        VALUES (${contactId}::uuid, ${tenantId}::uuid, 'Recovery customer', 'en')`;
      await sql`INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
        VALUES (${leadId}::uuid, ${tenantId}::uuid, ${contactId}::uuid, 'Recovery appointment', 'integration_test')`;
      await sql`INSERT INTO tenancy.appointment_requests (id, tenant_id, lead_id, timezone, idempotency_key, status)
        VALUES (${appointmentId}::uuid, ${tenantId}::uuid, ${leadId}::uuid, 'Asia/Bangkok', ${`recovery-appointment:${appointmentId}`}, 'confirmed')`;
      await sql`INSERT INTO tenancy.appointment_time_options
        (id, tenant_id, appointment_request_id, start_at, end_at, preference_order, source, verification_status)
        VALUES (${optionId}::uuid, ${tenantId}::uuid, ${appointmentId}::uuid, now() + interval '1 day', now() + interval '1 day 1 hour', 1, 'customer', 'confirmed')`;
      await sql`INSERT INTO tenancy.voice_scheduling_profiles
        (id, tenant_id, name, provider_kind, config_ciphertext, created_by_membership_id)
        VALUES (${profileId}::uuid, ${tenantId}::uuid, 'Recovery calendar', 'google_calendar', 'sealed-recovery-config-long-enough', ${membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.voice_scheduling_jobs
        (id, tenant_id, scheduling_profile_id, appointment_request_id, operation, idempotency_key,
         status, attempt_count, safe_error_code, completed_at)
        VALUES (${calendarJobId}::uuid, ${tenantId}::uuid, ${profileId}::uuid, ${appointmentId}::uuid,
          'create', ${`recovery-calendar:${calendarJobId}`}, 'dead_letter', 10, 'calendar_timeout', now())`;
    });
    const store = new PlatformRecoveryStore(platformClient!);
    await expect(platformClient!`SELECT * FROM platform.dead_letter_replay_requests`).rejects.toThrow();
    const support = createPlatformContext({
      platformUserId: supportId, sessionId: randomUUID(), role: "platform_support",
      requestId: "recovery-request", reauthenticatedAt: new Date(),
    });
    const requesterOwner = createPlatformContext({
      platformUserId: requesterOwnerId, sessionId: randomUUID(), role: "platform_owner",
      requestId: "recovery-request", reauthenticatedAt: new Date(),
    });
    const reviewerOwner = createPlatformContext({
      platformUserId: reviewerOwnerId, sessionId: randomUUID(), role: "platform_owner",
      requestId: "recovery-review", reauthenticatedAt: new Date(),
    });

    const overview = await store.overview(support);
    expect(overview.recoverable).toEqual(expect.arrayContaining([
      expect.objectContaining({ itemId, queueKind: "system_email", attemptCount: 8, safeErrorCode: "delivery_rejected" }),
      expect.objectContaining({ itemId: calendarJobId, queueKind: "appointment_calendar", attemptCount: 10, safeErrorCode: "calendar_timeout" }),
    ]));
    expect(JSON.stringify(overview)).not.toContain("secret-recipient-and-token");
    expect(JSON.stringify(overview)).not.toContain(excludedId);
    expect(overview.policy.excludedQueueKinds).toEqual(["flowbot_webhook", "social_inbound", "social_delivery"]);

    const requested = await store.request(requesterOwner, {
      queueKind: "system_email", itemId, attemptCount: 8,
      reason: "Root cause corrected; permit one idempotent email retry.",
    });
    expect(requested.status).toBe("requested");
    if (requested.status !== "requested") throw new Error("Expected recovery request.");
    const calendarRequest = await store.request(requesterOwner, {
      queueKind: "appointment_calendar", itemId: calendarJobId, attemptCount: 10,
      reason: "Calendar credentials corrected; permit a bounded provider retry.",
    });
    if (calendarRequest.status !== "requested") throw new Error("Expected calendar recovery request.");
    await expect(store.request(support, {
      queueKind: "system_email", itemId, attemptCount: 8,
      reason: "Duplicate request must not create another review.",
    })).resolves.toEqual({ status: "not_requestable" });
    await expect(store.review(support, requested.requestId, "approve")).rejects.toThrow();
    await expect(store.review(requesterOwner, requested.requestId, "approve")).resolves.toEqual({ status: "not_reviewable" });
    await expect(store.review(reviewerOwner, requested.requestId, "approve")).resolves.toEqual({ status: "applied" });
    await expect(store.review(reviewerOwner, calendarRequest.requestId, "approve")).resolves.toEqual({ status: "applied" });
    await expect(store.review(reviewerOwner, requested.requestId, "approve")).resolves.toEqual({ status: "not_reviewable" });

    const source = await adminClient!<{ status: string; attemptCount: number; payload: string; error: string }[]>`
      SELECT status, attempt_count AS "attemptCount", payload_ciphertext AS payload,
             last_error_code AS error FROM operations.outbox WHERE id = ${itemId}::uuid
    `;
    expect(source[0]).toEqual({ status: "failed", attemptCount: 8, payload: "secret-recipient-and-token", error: "reviewed_replay" });
    const worker = new PostgresEmailOutboxStore(workerClient!);
    const claimed = await worker.claimBatch(new Date(), 10, new Date(Date.now() - 5 * 60 * 1_000));
    expect(claimed).toEqual([
      expect.objectContaining({ id: itemId, attemptCount: 9, payloadCiphertext: "secret-recipient-and-token" }),
    ]);
    await worker.markSent(itemId, new Date());
    const appointmentWorker = new AppointmentSyncWorkerStore(workerClient!);
    const recoveredCalendar = await appointmentWorker.claim();
    expect(recoveredCalendar).toMatchObject({ job_id: calendarJobId, attempt_count: 1, operation: "create" });
    await expect(appointmentWorker.finish(calendarJobId, { succeeded: true, externalEventRef: "recovered-event" })).resolves.toBe(true);
    await expect(adminClient!<{ status: string; generation: number; attempt: number }[]>`
      SELECT job.status, job.recovery_generation AS generation, attempt.attempt_number AS attempt
      FROM tenancy.voice_scheduling_jobs job JOIN tenancy.appointment_sync_attempts attempt
        ON attempt.tenant_id = job.tenant_id AND attempt.scheduling_job_id = job.id
      WHERE job.id = ${calendarJobId}::uuid
    `).resolves.toEqual([{ status: "confirmed", generation: 1, attempt: 1 }]);
    await expect(adminClient!<{ status: string; attemptCount: number; payload: string }[]>`
      SELECT status, attempt_count AS "attemptCount", payload_ciphertext AS payload
      FROM operations.outbox WHERE id = ${itemId}::uuid
    `).resolves.toEqual([{ status: "sent", attemptCount: 9, payload: "secret-recipient-and-token" }]);
    const audit = await adminClient!<{ action: string }[]>`
      SELECT action FROM platform.audit_logs WHERE target_id IN (${requested.requestId}, ${itemId})
        OR metadata->>'itemId' = ${itemId} ORDER BY created_at
    `;
    expect(audit.map((row) => row.action)).toEqual([
      "dead_letter_replay.requested", "dead_letter_replay.applied",
    ]);

    const changedItemId = randomUUID();
    await adminClient!`
      INSERT INTO operations.outbox (
        id, topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key,
        status, attempt_count, processed_at, last_error_code
      ) VALUES (${changedItemId}::uuid, 'auth.recover_password', 'user', ${randomUUID()}::uuid,
        'unchanged-secret', ${`recovery:${changedItemId}`}, 'dead_letter', 8, now(), 'delivery_rejected')
    `;
    const changedRequest = await store.request(requesterOwner, {
      queueKind: "system_email", itemId: changedItemId, attemptCount: 8,
      reason: "Review requested before the source snapshot changed.",
    });
    if (changedRequest.status !== "requested") throw new Error("Expected changed-source request.");
    await adminClient!`UPDATE operations.outbox SET attempt_count = 9 WHERE id = ${changedItemId}::uuid`;
    await expect(store.review(reviewerOwner, changedRequest.requestId, "approve"))
      .resolves.toEqual({ status: "invalidated" });
    await expect(adminClient!<{ status: string; attemptCount: number }[]>`
      SELECT status, attempt_count AS "attemptCount" FROM operations.outbox WHERE id = ${changedItemId}::uuid
    `).resolves.toEqual([{ status: "dead_letter", attemptCount: 9 }]);
  });
});
