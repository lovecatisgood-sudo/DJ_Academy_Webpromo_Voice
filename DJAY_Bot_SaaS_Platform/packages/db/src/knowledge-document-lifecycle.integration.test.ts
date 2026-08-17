import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { KnowledgeIngestionWorkerStore, TenantKnowledgeIngestionStore } from "./knowledge-ingestion-store";
import { SharedDomainStore } from "./shared-domain-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && workerUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await workerClient?.end(); await adminClient?.end(); });

async function provisionKnowledge(tenantId: string) {
  const subscriptionId = randomUUID(); const snapshotId = randomUUID();
  const planVersionId = "62000000-0000-4000-8000-000000000103";
  await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'ai_chat' AND status <> 'cancelled'`;
  await adminClient!`INSERT INTO tenancy.product_subscriptions
    (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${planVersionId}::uuid, 'active', now(), now() + interval '30 days')`;
  await adminClient!`INSERT INTO tenancy.entitlement_snapshots
    (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status, access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'ai_chat', ${planVersionId}::uuid,
      'active', 'active', ${adminClient!.json({ entitlements: { "knowledge.enabled": true }, limits: { knowledge_collections: 1 } })},
      digest(${snapshotId}, 'sha256'))`;
}

describe.runIf(enabled)("document knowledge lifecycle", () => {
  it("shows processing and safe failure, then preserves attributed ready evidence within its tenant", async () => {
    const context = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "knowledge-document-lifecycle",
    });
    const otherContext = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "knowledge-document-cross-tenant",
    });
    const ingestion = new TenantKnowledgeIngestionStore(tenantClient!);
    const shared = new SharedDomainStore(tenantClient!);
    const worker = new KnowledgeIngestionWorkerStore(workerClient!);
    await provisionKnowledge(context.tenantId);
    await provisionKnowledge(otherContext.tenantId);
    const existing = await ingestion.listCollections(context);
    let collectionId = existing[0]?.id;
    if (!collectionId) {
      const created = await ingestion.createCollection(context, { name: "Document evidence", description: "Lifecycle test" });
      if (created.status === "created") collectionId = created.collectionId;
    }
    if (!collectionId) throw new Error("Expected an entitled knowledge collection.");

    const readyUpload = await ingestion.initiateUpload(context, {
      collectionId, name: "Attributed guide", filename: "guide.txt", mediaType: "text/plain", size: 24,
    });
    expect(readyUpload.status).toBe("created");
    if (readyUpload.status !== "created") throw new Error("Expected upload authority.");
    expect((await shared.listKnowledge(context)).find((source) => source.id === readyUpload.sourceId)).toMatchObject({
      status: "processing", version: 0, revisionId: null,
    });
    await expect(ingestion.completeUpload(context, readyUpload.objectId, 24)).resolves.toMatchObject({ status: "queued" });
    await adminClient!`UPDATE tenancy.knowledge_ingestion_jobs SET status = 'processing', attempt_count = 1, locked_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND id = ${readyUpload.jobId}::uuid`;
    const content = "[Source page 1]\nApproved business facts.";
    await expect(worker.complete({ jobId: readyUpload.jobId, content, chunks: [content],
      provenance: { kind: "file_extract", sourceId: readyUpload.sourceId, mediaType: "text/plain", attribution: "page", sectionCount: 1, extractorVersion: "knowledge-v2" },
      observedSize: 24, sha256: Buffer.alloc(32, 7) })).resolves.toEqual(expect.any(String));
    expect((await shared.listKnowledge(context)).find((source) => source.id === readyUpload.sourceId)).toMatchObject({
      status: "ready", version: 1, safeErrorCode: null,
    });
    const revision = await adminClient!<{ content: string; provenance: Record<string, unknown>; chunk: string }[]>`
      SELECT revision.content_text AS content, revision.provenance_json AS provenance, chunk.content_text AS chunk
      FROM tenancy.knowledge_source_revisions revision JOIN tenancy.knowledge_chunks chunk
        ON chunk.tenant_id = revision.tenant_id AND chunk.source_revision_id = revision.id
      WHERE revision.tenant_id = ${context.tenantId}::uuid AND revision.source_id = ${readyUpload.sourceId}::uuid`;
    expect(revision[0]).toMatchObject({ content, chunk: content, provenance: { sourceId: readyUpload.sourceId, attribution: "page" } });
    expect((await shared.listKnowledge(otherContext)).some((source) => source.id === readyUpload.sourceId)).toBe(false);
    await expect(ingestion.getSource(context, readyUpload.sourceId)).resolves.toMatchObject({
      id: readyUpload.sourceId, version: 1, content, chunkCount: 1, contentTruncated: false,
    });
    await expect(ingestion.getSource(otherContext, readyUpload.sourceId)).resolves.toBeNull();
    await expect(ingestion.setSourceInclusion(context, readyUpload.sourceId, false)).resolves.toEqual({ status: "excluded" });
    const corrected = await ingestion.reviseSource(context, readyUpload.sourceId, {
      name: "Corrected attributed guide", content: "Approved corrected business facts.",
    });
    expect(corrected).toMatchObject({ status: "corrected", version: 2 });
    expect((await shared.listKnowledge(context)).find((source) => source.id === readyUpload.sourceId)?.status).toBe("excluded");
    await expect(ingestion.setSourceInclusion(otherContext, readyUpload.sourceId, true)).resolves.toEqual({ status: "not_found" });
    await expect(ingestion.reindexSource(context, readyUpload.sourceId)).resolves.toMatchObject({ status: "reindexed", version: 3 });
    await expect(ingestion.reprocessSource(context, readyUpload.sourceId)).resolves.toMatchObject({ status: "queued" });
    await expect(ingestion.reprocessSource(context, readyUpload.sourceId)).resolves.toMatchObject({ status: "already_queued" });
    await expect(ingestion.setSourceInclusion(context, readyUpload.sourceId, true)).resolves.toEqual({ status: "included" });
    await expect(ingestion.deleteSource(otherContext, readyUpload.sourceId)).resolves.toEqual({ status: "not_found" });
    await expect(ingestion.deleteSource(context, readyUpload.sourceId)).resolves.toMatchObject({ status: "deleted" });
    await expect(ingestion.getSource(context, readyUpload.sourceId)).resolves.toBeNull();
    expect((await shared.listKnowledge(context)).some((source) => source.id === readyUpload.sourceId)).toBe(false);
    const deletedState = await adminClient!<{ sourceStatus: string; objectStatus: string; jobStatus: string; revisionCount: number }[]>`
      SELECT source.status AS "sourceStatus", object.status AS "objectStatus", job.status AS "jobStatus",
        (SELECT count(*)::int FROM tenancy.knowledge_source_revisions revision
          WHERE revision.tenant_id = source.tenant_id AND revision.source_id = source.id) AS "revisionCount"
      FROM tenancy.knowledge_sources source JOIN tenancy.knowledge_objects object
        ON object.tenant_id = source.tenant_id AND object.source_id = source.id
      JOIN tenancy.knowledge_ingestion_jobs job ON job.tenant_id = source.tenant_id AND job.source_id = source.id
      WHERE source.tenant_id = ${context.tenantId}::uuid AND source.id = ${readyUpload.sourceId}::uuid
      ORDER BY job.created_at DESC LIMIT 1`;
    expect(deletedState[0]).toEqual({ sourceStatus: "erased", objectStatus: "deleted", jobStatus: "dead_letter", revisionCount: 3 });

    const rejected = await ingestion.initiateUpload(context, {
      collectionId, name: "Rejected guide", filename: "rejected.pdf", mediaType: "application/pdf", size: 20,
    });
    if (rejected.status !== "created") throw new Error("Expected second upload authority.");
    await expect(ingestion.completeUpload(context, rejected.objectId, 20)).resolves.toMatchObject({ status: "queued" });
    await adminClient!`UPDATE tenancy.knowledge_ingestion_jobs SET status = 'processing', attempt_count = 1, locked_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND id = ${rejected.jobId}::uuid`;
    await expect(worker.fail(rejected.jobId, "malware_detected", false)).resolves.toBe(true);
    expect((await shared.listKnowledge(context)).find((source) => source.id === rejected.sourceId)).toMatchObject({
      status: "failed", version: 0, safeErrorCode: "malware_detected",
    });
  });
});
