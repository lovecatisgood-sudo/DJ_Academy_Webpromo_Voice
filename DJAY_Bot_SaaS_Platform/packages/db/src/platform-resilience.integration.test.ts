import { createHash, randomBytes, randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import { runEmailBatch } from "@djay/notifications";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient, DatabaseReadinessProbe } from "./client";
import { PostgresEmailOutboxStore } from "./email-outbox-store";
import { PlatformOperationsStore } from "./platform-operations-store";

const workerUrl = process.env.WORKER_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(workerUrl && platformUrl && adminUrl);
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await workerClient?.end();
  await platformClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("P9 replay, queue recovery, and pool exhaustion", () => {
  it("recovers without duplicate effects, fails readiness quickly, and records drill evidence", async () => {
    const now = new Date();
    // The full integration runner shares one disposable database across suites.
    // Isolate this batch-size-one drill from outbox rows created by earlier fixtures.
    await adminClient!`DELETE FROM operations.outbox`;
    const key = randomBytes(32);
    const retryId = randomUUID();
    const staleId = randomUUID();
    const payload = sealJson({
      template: "verify-email",
      to: "resilience@example.test",
      verificationUrl: "https://signup.example.test/verify-email?token=opaque",
    }, key);
    await adminClient!`
      INSERT INTO operations.outbox (
        id, topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key,
        available_at
      ) VALUES (
        ${retryId}::uuid, 'auth.verify_email', 'resilience_drill', ${randomUUID()}::uuid,
        ${payload}, ${`resilience-retry:${retryId}`}, ${now}
      )
    `;

    const store = new PostgresEmailOutboxStore(workerClient!);
    const providerEffects = new Set<string>();
    const deliveryKeys: string[] = [];
    let firstAttempt = true;
    const delivery = {
      async send(_message: unknown, idempotencyKey: string) {
        deliveryKeys.push(idempotencyKey);
        providerEffects.add(idempotencyKey);
        if (firstAttempt) {
          firstAttempt = false;
          throw new Error("delivery_rejected");
        }
      },
    };

    const first = await runEmailBatch(store, delivery, key, { now, batchSize: 1 });
    expect(first).toEqual({ claimed: 1, sent: 0, failed: 1 });
    expect(deliveryKeys).toEqual([retryId]);
    const retryAt = new Date(now.getTime() + 61_000);
    const recovered = await runEmailBatch(store, delivery, key, { now: retryAt, batchSize: 1 });
    expect(recovered).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const replay = await runEmailBatch(store, delivery, key, {
      now: new Date(retryAt.getTime() + 61_000), batchSize: 1,
    });
    expect(replay).toEqual({ claimed: 0, sent: 0, failed: 0 });
    expect(deliveryKeys).toEqual([retryId, retryId]);
    expect(providerEffects.size).toBe(1);

    await adminClient!`
      INSERT INTO operations.outbox (
        id, topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key,
        status, attempt_count, locked_at, available_at
      ) VALUES (
        ${staleId}::uuid, 'auth.verify_email', 'resilience_drill', ${randomUUID()}::uuid,
        ${payload}, ${`resilience-stale:${staleId}`}, 'processing', 1,
        ${new Date(now.getTime() - 10 * 60_000)},
        ${new Date(now.getTime() - 10 * 60_000)}
      )
    `;
    const staleRecovered = await runEmailBatch(store, delivery, key, {
      now: new Date(now.getTime() + 2 * 60_000), batchSize: 1,
    });
    expect(staleRecovered).toEqual({ claimed: 1, sent: 1, failed: 0 });
    const queueRows = await adminClient!<{ id: string; status: string; attempt_count: number }[]>`
      SELECT id, status, attempt_count FROM operations.outbox
      WHERE id IN (${retryId}::uuid, ${staleId}::uuid) ORDER BY id
    `;
    expect(queueRows).toEqual(expect.arrayContaining([
      { id: retryId, status: "sent", attempt_count: 2 },
      { id: staleId, status: "sent", attempt_count: 2 },
    ]));

    const constrainedPool = createDatabaseClient(adminUrl!, { maxConnections: 2 });
    const firstConnection = await constrainedPool.reserve();
    const secondConnection = await constrainedPool.reserve();
    const probe = new DatabaseReadinessProbe(constrainedPool);
    let firstReleased = false;
    try {
      const unavailable = await probe.check(100);
      expect(unavailable).toMatchObject({ status: "unavailable", reason: "timeout" });
      expect(unavailable.latencyMs).toBeLessThan(500);
      firstConnection.release();
      firstReleased = true;
      await expect(probe.check(1_000)).resolves.toMatchObject({ status: "ready" });
      await expect(constrainedPool`SELECT 1 AS recovered`).resolves.toEqual([{ recovered: 1 }]);
    } finally {
      if (!firstReleased) firstConnection.release();
      secondConnection.release();
      await constrainedPool.end({ timeout: 2 });
    }

    const platformUserId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES (${platformUserId}::uuid, ${`resilience-${platformUserId}@example.test`},
              'Resilience Operator', 'not-used', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.role_assignments (platform_user_id, role)
      VALUES (${platformUserId}::uuid, 'platform_owner')
    `;
    const context = createPlatformContext({
      platformUserId, sessionId: randomUUID(), role: "platform_owner",
      requestId: "p9-resilience-drill", reauthenticatedAt: now,
    });
    const operations = new PlatformOperationsStore(platformClient!);
    const evidence = JSON.stringify({
      retryId, staleId, duplicateEffects: 0, recoveredItems: 2,
      poolTimeoutMs: 100, poolRecovered: true,
    });
    for (const attestationKind of ["event_replay", "queue_recovery", "pool_exhaustion"] as const) {
      await expect(operations.ingestAttestation({
        environment: "staging", attestationKind, status: "passed",
        validFrom: now, validUntil: new Date(now.getTime() + 7 * 24 * 60 * 60_000),
        evidenceSha256: createHash("sha256").update(`${attestationKind}:${evidence}`).digest(),
        sourceReference: `drill:local:${attestationKind}`,
        requestId: `drill-${attestationKind}`, now,
      })).resolves.toMatchObject({ status: "recorded" });
    }
  });
});
