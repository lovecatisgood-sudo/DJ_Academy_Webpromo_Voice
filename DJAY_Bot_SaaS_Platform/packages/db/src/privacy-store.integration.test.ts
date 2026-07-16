import { randomBytes, randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PrivacyStore } from "./privacy-store";
import { SharedDomainStore } from "./shared-domain-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && workerUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await workerClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("P3 privacy processing", () => {
  it("exports derived data under encryption and erases personal data with immutable lineage", async () => {
    const contextA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "privacy-a",
    });
    const contextB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "privacy-b",
    });
    const pending = await adminClient!<{ id: string; contact_id: string }[]>`
      SELECT id, contact_id FROM tenancy.privacy_jobs
      WHERE tenant_id = ${contextA.tenantId}::uuid AND job_type = 'export' AND status = 'requested'
      ORDER BY requested_at LIMIT 1
    `;
    expect(pending[0]).toBeTruthy();
    const exportJob = pending[0]!;
    const encryptionKey = randomBytes(32);
    const privacy = new PrivacyStore(workerClient!);
    const expiredMessageId = randomUUID();
    await adminClient!`
      INSERT INTO tenancy.messages (
        id, tenant_id, conversation_id, sequence, actor_type, direction, content_json, created_at
      ) SELECT ${expiredMessageId}::uuid, conversation.tenant_id, conversation.id, 999,
        'customer', 'inbound', '{"text":"expired transcript"}'::jsonb, now() - interval '100 days'
      FROM tenancy.conversations conversation
      WHERE conversation.tenant_id = ${contextA.tenantId}::uuid
        AND conversation.contact_id = ${exportJob.contact_id}::uuid
      ORDER BY conversation.started_at LIMIT 1
    `;
    await expect(privacy.applyRetention(new Date(), 100, "privacy-retention-worker")).resolves.toMatchObject({
      messagesRedacted: 1,
    });
    const retained = await adminClient!<{ type: string; text: string }[]>`
      SELECT content_json->>'type' AS type, content_json->>'text' AS text
      FROM tenancy.messages WHERE id = ${expiredMessageId}::uuid
    `;
    expect(retained[0]).toEqual({ type: "retained_tombstone", text: "[transcript expired]" });
    await expect(privacy.processNext(encryptionKey, "privacy-export-worker")).resolves.toMatchObject({
      status: "completed", jobId: exportJob.id, jobType: "export",
    });
    const tenantPrivacy = new PrivacyStore(tenantClient!);
    const artifact = await tenantPrivacy.readExport(contextA, exportJob.id, encryptionKey);
    expect(artifact?.format).toBe("djay-privacy-export-v1");
    expect(artifact?.data.contacts).toHaveLength(1);
    expect(artifact?.data.messages).toHaveLength(3);
    expect(artifact?.data.leads).toHaveLength(1);
    await expect(tenantPrivacy.readExport(contextB, exportJob.id, encryptionKey)).resolves.toBeNull();

    const shared = new SharedDomainStore(tenantClient!);
    await expect(shared.requestPrivacyJob(contextA, {
      jobType: "erasure", idempotencyKey: `unscoped-${randomUUID()}`,
    } as never)).rejects.toThrow();
    await expect(adminClient!`
      INSERT INTO tenancy.privacy_jobs (
        id, tenant_id, contact_id, job_type, scope_json, idempotency_key, requested_by_membership_id
      ) VALUES (
        ${randomUUID()}::uuid, ${contextA.tenantId}::uuid, NULL, 'erasure',
        ${adminClient!.json({ contactId: null })}, ${`raw-unscoped-${randomUUID()}`},
        ${contextA.membershipId}::uuid
      )
    `).rejects.toThrow(/privacy_erasure_requires_contact/);
    const erasure = await shared.requestPrivacyJob(contextA, {
      jobType: "erasure", contactId: exportJob.contact_id, idempotencyKey: `erase-${randomUUID()}`,
    });
    expect(erasure.status).toBe("accepted");
    if (erasure.status !== "accepted") throw new Error("privacy erasure was not accepted");
    await expect(privacy.processNext(encryptionKey, "privacy-erasure-worker")).resolves.toMatchObject({
      status: "completed", jobId: erasure.jobId, jobType: "erasure",
    });
    expect(await shared.listContacts(contextA)).toHaveLength(0);
    const redaction = await adminClient!<{ contact_status: string; message_text: string; lineage_count: number }[]>`
      SELECT contact.status AS contact_status,
        (SELECT message.content_json->>'text' FROM tenancy.messages message
         JOIN tenancy.conversations conversation ON conversation.id = message.conversation_id
         WHERE conversation.contact_id = contact.id ORDER BY message.sequence LIMIT 1) AS message_text,
        (SELECT count(*)::int FROM tenancy.privacy_lineage lineage
         WHERE lineage.privacy_job_id = ${erasure.jobId}::uuid) AS lineage_count
      FROM tenancy.contacts contact WHERE contact.id = ${exportJob.contact_id}::uuid
    `;
    expect(redaction[0]?.contact_status).toBe("erased");
    expect(redaction[0]?.message_text).toBe("[personal data erased]");
    expect(redaction[0]?.lineage_count).toBeGreaterThanOrEqual(5);

    const unscoped = await workerClient!<{ count: number }[]>`SELECT count(*)::int AS count FROM tenancy.privacy_jobs`;
    expect(unscoped[0]?.count).toBe(0);
  });
});
