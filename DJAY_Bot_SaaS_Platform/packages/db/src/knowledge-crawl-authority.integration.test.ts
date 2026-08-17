import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { KnowledgeIngestionWorkerStore, TenantKnowledgeIngestionStore } from "./knowledge-ingestion-store";

const tenantUrl = process.env.TENANT_DATABASE_URL; const adminUrl = process.env.ADMIN_DATABASE_URL; const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl && workerUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); await workerClient?.end(); });

async function provisionPlan(tenantId: string, planVersionId: string, collectionLimit: number | null, activatedDaysAgo = 0) {
  const subscriptionId = randomUUID(); const snapshotId = randomUUID();
  const periodStart = new Date(Date.now() - activatedDaysAgo * 24 * 60 * 60 * 1000);
  await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'ai_chat' AND status <> 'cancelled'`;
  await adminClient!`INSERT INTO tenancy.product_subscriptions
    (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${planVersionId}::uuid, 'active', ${periodStart}, now() + interval '30 days')`;
  await adminClient!`INSERT INTO tenancy.entitlement_snapshots
    (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status, access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'ai_chat', ${planVersionId}::uuid,
      'active', 'active', ${adminClient!.json({ entitlements: { "knowledge.enabled": true }, limits: { knowledge_collections: collectionLimit } })},
      public.digest(${snapshotId}, 'sha256'))`;
}

describe.runIf(enabled)("website crawl authority", () => {
  it("pins Starter to one page and Advanced to a bounded same-scope crawl", async () => {
    const context = createTenantContext({ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "knowledge-crawl-authority" });
    const store = new TenantKnowledgeIngestionStore(tenantClient!);
    const worker = new KnowledgeIngestionWorkerStore(workerClient!);
    await provisionPlan(context.tenantId, "62000000-0000-4000-8000-000000000103", 1);
    let collectionId = (await store.listCollections(context))[0]?.id;
    if (!collectionId) {
      const created = await store.createCollection(context, { name: "Website evidence", description: "Crawl authority" });
      if (created.status === "created") collectionId = created.collectionId;
    }
    if (!collectionId) throw new Error("Expected an entitled knowledge collection.");
    const starter = await store.requestCrawl(context, { collectionId, name: "Starter page",
      url: "https://example.com/services" });
    expect(starter).toMatchObject({ status: "queued", crawlMode: "single_page", pageLimit: 1, refreshIntervalHours: 168 });

    await provisionPlan(context.tenantId, "62000000-0000-4000-8000-000000000104", null);
    const advanced = await store.requestCrawl(context, { collectionId, name: "Advanced scope",
      url: "https://example.com/services" });
    expect(advanced).toMatchObject({ status: "queued", crawlMode: "same_scope", pageLimit: 25, refreshIntervalHours: null });
    if (starter.status !== "queued" || advanced.status !== "queued") throw new Error("Expected crawl jobs.");
    const rows = await adminClient!<{ id: string; pageLimit: number; refreshHours: number | null }[]>`
      SELECT id, crawl_page_limit::int AS "pageLimit", refresh_interval_hours::int AS "refreshHours"
      FROM tenancy.knowledge_sources WHERE tenant_id = ${context.tenantId}::uuid
        AND id IN (${starter.sourceId}::uuid, ${advanced.sourceId}::uuid) ORDER BY name`;
    expect(rows).toEqual([
      { id: advanced.sourceId, pageLimit: 25, refreshHours: null },
      { id: starter.sourceId, pageLimit: 1, refreshHours: 168 },
    ]);
    await expect(worker.reserveCrawlHost("example.com", 500)).resolves.toBe(0);
    await expect(worker.reserveCrawlHost("example.com", 500)).resolves.toBeGreaterThanOrEqual(400);
    await provisionPlan(context.tenantId, "62000000-0000-4000-8000-000000000103", 1);
    const firstClaim = await worker.claim();
    expect(firstClaim).toMatchObject({ source_id: starter.sourceId, crawl_page_limit: 1 });
    if (!firstClaim) throw new Error("Expected Starter crawl claim.");
    await worker.fail(firstClaim.job_id, "crawl_http_rejected", false);
    const downgradedClaim = await worker.claim();
    expect(downgradedClaim).toMatchObject({ source_id: advanced.sourceId, crawl_page_limit: 1 });
    if (!downgradedClaim) throw new Error("Expected downgraded crawl claim.");
    await worker.fail(downgradedClaim.job_id, "crawl_http_rejected", false);
  });

  it("enforces weekly Starter refresh and a governed monthly Advanced review", async () => {
    const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "knowledge-refresh-review" });
    const store = new TenantKnowledgeIngestionStore(tenantClient!);
    const worker = new KnowledgeIngestionWorkerStore(workerClient!);
    await provisionPlan(context.tenantId, "62000000-0000-4000-8000-000000000103", 1);
    let collectionId = (await store.listCollections(context))[0]?.id;
    if (!collectionId) {
      const created = await store.createCollection(context, { name: "Refresh evidence", description: "Plan scheduler" });
      if (created.status === "created") collectionId = created.collectionId;
    }
    if (!collectionId) throw new Error("Expected Starter knowledge collection.");
    const source = await store.requestCrawl(context, { collectionId, name: "Weekly source", url: "https://example.com/weekly" });
    if (source.status !== "queued") throw new Error("Expected Starter crawl.");
    await adminClient!`UPDATE tenancy.knowledge_ingestion_jobs SET status = 'succeeded', completed_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND id = ${source.jobId}::uuid`;
    await adminClient!`UPDATE tenancy.knowledge_sources SET refresh_interval_hours = 24, next_refresh_at = now() - interval '1 hour'
      WHERE tenant_id = ${context.tenantId}::uuid AND id = ${source.sourceId}::uuid`;
    await expect(worker.enqueueDue()).resolves.toBe(1);
    const scheduled = await worker.claim();
    expect(scheduled).toMatchObject({ source_id: source.sourceId, job_kind: "scheduled_refresh", crawl_page_limit: 1 });
    if (!scheduled) throw new Error("Expected weekly refresh claim.");
    await worker.fail(scheduled.job_id, "crawl_http_rejected", false);
    const starterPolicy = await adminClient!<{ intervalHours: number; nextRefreshAt: Date }[]>`SELECT
      refresh_interval_hours::int AS "intervalHours", next_refresh_at AS "nextRefreshAt"
      FROM tenancy.knowledge_sources WHERE tenant_id = ${context.tenantId}::uuid AND id = ${source.sourceId}::uuid`;
    expect(starterPolicy[0]?.intervalHours).toBe(168);

    await provisionPlan(context.tenantId, "62000000-0000-4000-8000-000000000104", null, 31);
    await expect(worker.enqueueDue()).resolves.toBe(0);
    await expect(worker.enqueueReviewsDue()).resolves.toBe(1);
    await expect(worker.enqueueReviewsDue()).resolves.toBe(0);
    const reviewState = await store.listKnowledgeReviews(context);
    expect(reviewState.advanced).toBe(true);
    expect(reviewState.reviews[0]).toMatchObject({ status: "due" });
    expect(reviewState.reviews[0]!.sourceCount).toBeGreaterThanOrEqual(1);
    expect(reviewState.reviews[0]!.attentionCount).toBeGreaterThanOrEqual(1);
    expect(reviewState.owners.some((owner) => owner.membershipId === context.membershipId)).toBe(true);
    const reviewId = reviewState.reviews[0]!.id;
    await expect(store.updateKnowledgeReview(context, reviewId, { action: "start", ownerMembershipId: context.membershipId }))
      .resolves.toMatchObject({ status: "in_progress" });
    await expect(store.updateKnowledgeReview(context, reviewId, { action: "complete", ownerMembershipId: context.membershipId,
      note: "Reviewed the failed refresh and assigned a safe manual correction." })).resolves.toMatchObject({ status: "completed" });
    await expect(store.updateKnowledgeReview(context, reviewId, { action: "start", ownerMembershipId: context.membershipId }))
      .resolves.toMatchObject({ status: "not_found_or_completed" });
    await expect(adminClient!`UPDATE tenancy.knowledge_review_cycles SET completion_note = 'Rewritten evidence'
      WHERE tenant_id = ${context.tenantId}::uuid AND id = ${reviewId}::uuid`).rejects.toThrow("knowledge_review_evidence_immutable");
    const advancedPolicy = await adminClient!<{ intervalHours: number | null; nextRefreshAt: Date | null }[]>`SELECT
      refresh_interval_hours::int AS "intervalHours", next_refresh_at AS "nextRefreshAt"
      FROM tenancy.knowledge_sources WHERE tenant_id = ${context.tenantId}::uuid AND id = ${source.sourceId}::uuid`;
    expect(advancedPolicy[0]).toEqual({ intervalHours: null, nextRefreshAt: null });
  });
});
