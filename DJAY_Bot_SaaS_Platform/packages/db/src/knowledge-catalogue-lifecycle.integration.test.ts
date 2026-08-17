import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { AiChatStore } from "./ai-chat-store";
import { createDatabaseClient } from "./client";
import { TenantKnowledgeIngestionStore, type KnowledgeCatalogueDraft } from "./knowledge-ingestion-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); });

async function provisionAiText(tenantId: string, advanced: boolean) {
  const subscriptionId = randomUUID(); const snapshotId = randomUUID();
  const planVersionId = advanced ? "62000000-0000-4000-8000-000000000104" : "62000000-0000-4000-8000-000000000103";
  await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'ai_chat' AND status <> 'cancelled'`;
  await adminClient!`INSERT INTO tenancy.product_subscriptions
    (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${planVersionId}::uuid,
      'active', now(), now() + interval '30 days')`;
  await adminClient!`INSERT INTO tenancy.entitlement_snapshots
    (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status, access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'ai_chat', ${planVersionId}::uuid,
      'active', 'active', ${adminClient!.json({ entitlements: { "knowledge.enabled": true, "ai.text": true, "sales_core.enabled": true }, limits: {
        knowledge_collections: advanced ? null : 1, active_bots: advanced ? 3 : 1,
      } })}, digest(${snapshotId}, 'sha256'))`;
}

const draft = (collectionId: string, externalKey: string, name: string): KnowledgeCatalogueDraft => ({
  collectionId, itemKind: "service", externalKey, categoryKey: "consulting",
  localizedName: { th: `บริการ ${name}`, en: name },
  localizedDescription: { th: "คำแนะนำธุรกิจที่ได้รับอนุมัติ", en: "Approved business advice" },
  priceMinor: 150_000, currency: "THB", localizedPriceText: { th: "1,500 บาท", en: "THB 1,500" },
  availability: "available", options: [{ durationMinutes: 30 }],
  actionReference: { kind: "booking", value: "consultation" }, attributes: { audience: "small-business" },
});

describe.runIf(enabled)("Advanced structured knowledge catalogue lifecycle", () => {
  it("enforces Advanced authority, immutable draft versions and explicit publication", async () => {
    const basic = createTenantContext({ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(), role: "tenant_master_admin", requestId: "catalogue-basic" });
    const advanced = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(), role: "tenant_master_admin", requestId: "catalogue-advanced" });
    await provisionAiText(basic.tenantId, false); await provisionAiText(advanced.tenantId, true);
    const store = new TenantKnowledgeIngestionStore(tenantClient!);
    const aiChat = new AiChatStore(tenantClient!);
    const basicCollection = await store.createCollection(basic, { name: "Starter knowledge", description: "Starter facts" });
    const advancedCollection = await store.createCollection(advanced, { name: "Advanced catalogue", description: "Published catalogue facts" });
    expect(basicCollection.status).toBe("created"); expect(advancedCollection.status).toBe("created");
    if (basicCollection.status !== "created" || advancedCollection.status !== "created") throw new Error("Expected collections");
    await expect(store.saveCatalogDraft(basic, draft(basicCollection.collectionId, "starter", "Starter consultation")))
      .resolves.toEqual({ status: "not_entitled" });

    const first = await store.saveCatalogDraft(advanced, draft(advancedCollection.collectionId, "consult-30", "30-minute consultation"));
    expect(first).toMatchObject({ status: "saved_draft", version: 1 });
    if (first.status !== "saved_draft") throw new Error("Expected draft");
    expect(await store.listCatalogItems(advanced, advancedCollection.collectionId)).toMatchObject([
      { id: first.itemId, status: "draft", latestVersion: 1, publishedVersion: null,
        localizedName: { th: "บริการ 30-minute consultation", en: "30-minute consultation" } },
    ]);
    const agent = await aiChat.createAgent(advanced, { name: "Advanced Sales", businessName: "Advanced Merchant", defaultLanguage: "en" });
    expect(agent.status).toBe("created"); if (agent.status !== "created") throw new Error("Expected agent");
    await expect(store.setCatalogAgentBindings(advanced, advancedCollection.collectionId, [agent.agentId]))
      .resolves.toEqual({ status: "saved", agentIds: [agent.agentId] });
    expect(await store.listCatalogAgentBindings(advanced, advancedCollection.collectionId)).toEqual([
      expect.objectContaining({ agentId: agent.agentId, bound: true }),
    ]);
    const publishedFirst = await store.publishCatalogItem(advanced, first.itemId);
    expect(publishedFirst).toMatchObject({ status: "published", version: 1 });
    if (publishedFirst.status !== "published") throw new Error("Expected first publication");
    expect((await aiChat.getDraft(advanced, agent.agentId))?.knowledgeRevisionIds).toEqual([publishedFirst.revisionId]);
    await expect(store.publishCatalogItem(advanced, first.itemId)).resolves.toEqual({ status: "unchanged", itemId: first.itemId });

    const second = await store.saveCatalogDraft(advanced, draft(advancedCollection.collectionId, "consult-30", "Conversion consultation"));
    expect(second).toMatchObject({ status: "saved_draft", itemId: first.itemId, version: 2 });
    expect(await store.listCatalogItems(advanced, advancedCollection.collectionId)).toMatchObject([
      { status: "published_with_draft", latestVersion: 2, publishedVersion: 1 },
    ]);
    const beforeRepublish = await adminClient!<{ content: string }[]>`SELECT revision.content_text AS content
      FROM tenancy.knowledge_catalog_sources source
      JOIN tenancy.knowledge_source_revisions revision ON revision.tenant_id = source.tenant_id AND revision.source_id = source.source_id
      WHERE source.tenant_id = ${advanced.tenantId}::uuid AND source.collection_id = ${advancedCollection.collectionId}::uuid
      ORDER BY revision.version DESC LIMIT 1`;
    expect(beforeRepublish[0]?.content).toContain("30-minute consultation");
    expect(beforeRepublish[0]?.content).not.toContain("Conversion consultation");
    await expect(adminClient!`UPDATE tenancy.knowledge_catalog_item_versions SET availability = 'unavailable'
      WHERE id = ${first.versionId}::uuid`).rejects.toThrow(/versions are immutable/);

    const publishedSecond = await store.publishCatalogItem(advanced, first.itemId);
    expect(publishedSecond).toMatchObject({ status: "published", version: 2 });
    if (publishedSecond.status !== "published") throw new Error("Expected second publication");
    const pinnedAfterRepublish = (await aiChat.getDraft(advanced, agent.agentId))?.knowledgeRevisionIds ?? [];
    expect(pinnedAfterRepublish).toEqual([publishedSecond.revisionId]); expect(pinnedAfterRepublish[0]).not.toBe(publishedFirst.revisionId);
    const afterRepublish = await adminClient!<{ content: string }[]>`SELECT revision.content_text AS content
      FROM tenancy.knowledge_catalog_sources source
      JOIN tenancy.knowledge_source_revisions revision ON revision.tenant_id = source.tenant_id AND revision.source_id = source.source_id
      WHERE source.tenant_id = ${advanced.tenantId}::uuid AND source.collection_id = ${advancedCollection.collectionId}::uuid
      ORDER BY revision.version DESC LIMIT 1`;
    expect(afterRepublish[0]?.content).toContain("Conversion consultation");

    const withoutCollection = ({ collectionId: _collectionId, ...item }: KnowledgeCatalogueDraft) => item;
    await expect(store.importCatalogDrafts(advanced, advancedCollection.collectionId, []))
      .resolves.toEqual({ status: "validation_failed" });
    await expect(store.importCatalogDrafts(advanced, advancedCollection.collectionId, [
      withoutCollection(draft(advancedCollection.collectionId, "audit", "Catalogue audit")),
      withoutCollection(draft(advancedCollection.collectionId, "setup", "Setup service")),
    ])).resolves.toMatchObject({ status: "imported_drafts", count: 2 });
    await expect(store.archiveCatalogItem(advanced, first.itemId)).resolves.toMatchObject({ status: "archived" });
    expect((await aiChat.getDraft(advanced, agent.agentId))?.knowledgeRevisionIds).toEqual([]);
    expect(await store.listCatalogItems(advanced, advancedCollection.collectionId)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: first.itemId, status: "archived", publishedVersion: null }),
      expect.objectContaining({ externalKey: "audit", status: "draft" }),
    ]));
    await expect(store.listCatalogItems(basic, advancedCollection.collectionId)).resolves.toEqual([]);
  });
});
