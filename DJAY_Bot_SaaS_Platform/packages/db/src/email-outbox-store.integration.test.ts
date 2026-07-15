import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { sealJson } from "@djay/auth";
import { runEmailBatch } from "@djay/notifications";
import { createDatabaseClient } from "./client";
import { PostgresEmailOutboxStore } from "./email-outbox-store";

const workerUrl = process.env.WORKER_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(workerUrl && adminUrl);
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await workerClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("email outbox worker repository", () => {
  it("claims and completes an encrypted notification under the worker role", async () => {
    const id = randomUUID();
    const key = randomBytes(32);
    await adminClient!`
      INSERT INTO operations.outbox (
        id, topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key
      ) VALUES (
        ${id}::uuid, 'auth.verify_email', 'integration', ${randomUUID()}::uuid,
        ${sealJson({
          template: "verify-email",
          to: "delivery@example.test",
          verificationUrl: "https://signup.example.test/verify-email?token=opaque",
        }, key)},
        ${`worker-integration:${id}`}
      )
    `;
    const delivered: string[] = [];
    const result = await runEmailBatch(
      new PostgresEmailOutboxStore(workerClient!),
      { async send(message) { delivered.push(message.to); } },
      key,
      { now: new Date(), batchSize: 1 },
    );
    expect(result).toEqual({ claimed: 1, sent: 1, failed: 0 });
    expect(delivered).toEqual(["delivery@example.test"]);
    const rows = await adminClient!<{ status: string; attempt_count: number; processed: boolean }[]>`
      SELECT status, attempt_count, processed_at IS NOT NULL AS processed
      FROM operations.outbox WHERE id = ${id}::uuid
    `;
    expect(rows[0]).toEqual({ status: "sent", attempt_count: 1, processed: true });
  });
});
