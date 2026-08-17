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

async function provisionPlan(tenantId: string, planVersionId: string, collectionLimit: number | null) {
  const subscriptionId = randomUUID(); const snapshotId = randomUUID();
  await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'ai_chat' AND status <> 'cancelled'`;
  await adminClient!`INSERT INTO tenancy.product_subscriptions
    (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${planVersionId}::uuid, 'active', now(), now() + interval '30 days')`;
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
      url: "https://example.com/services", refreshIntervalHours: 168 });
    expect(starter).toMatchObject({ status: "queued", crawlMode: "single_page", pageLimit: 1 });

    await provisionPlan(context.tenantId, "62000000-0000-4000-8000-000000000104", null);
    const advanced = await store.requestCrawl(context, { collectionId, name: "Advanced scope",
      url: "https://example.com/services", refreshIntervalHours: 720 });
    expect(advanced).toMatchObject({ status: "queued", crawlMode: "same_scope", pageLimit: 25 });
    if (starter.status !== "queued" || advanced.status !== "queued") throw new Error("Expected crawl jobs.");
    const rows = await adminClient!<{ id: string; pageLimit: number; refreshHours: number }[]>`
      SELECT id, crawl_page_limit::int AS "pageLimit", refresh_interval_hours::int AS "refreshHours"
      FROM tenancy.knowledge_sources WHERE tenant_id = ${context.tenantId}::uuid
        AND id IN (${starter.sourceId}::uuid, ${advanced.sourceId}::uuid) ORDER BY name`;
    expect(rows).toEqual([
      { id: advanced.sourceId, pageLimit: 25, refreshHours: 720 },
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
});
