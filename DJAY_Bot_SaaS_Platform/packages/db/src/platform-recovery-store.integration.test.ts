import { randomUUID } from "node:crypto";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
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
    await expect(store.request(support, {
      queueKind: "system_email", itemId, attemptCount: 8,
      reason: "Duplicate request must not create another review.",
    })).resolves.toEqual({ status: "not_requestable" });
    await expect(store.review(support, requested.requestId, "approve")).rejects.toThrow();
    await expect(store.review(requesterOwner, requested.requestId, "approve")).resolves.toEqual({ status: "not_reviewable" });
    await expect(store.review(reviewerOwner, requested.requestId, "approve")).resolves.toEqual({ status: "applied" });
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
