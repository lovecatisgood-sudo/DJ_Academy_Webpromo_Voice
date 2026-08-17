import { createHash, randomUUID } from "node:crypto";
import { chunkKnowledge } from "@djay/sales-core";
import type { TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import { z } from "zod";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

const mediaTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);
export type KnowledgeMediaType = z.infer<typeof mediaTypeSchema>;

export type LocalizedCatalogueText = Readonly<{ th: string; en: string }>;
export type CatalogueActionReference = Readonly<{
  kind: "booking" | "quotation" | "checkout" | "contact" | "link";
  value: string;
}>;
export type KnowledgeCatalogueDraft = Readonly<{
  collectionId: string;
  itemKind: "product" | "service";
  externalKey: string;
  categoryKey: string | null;
  localizedName: LocalizedCatalogueText;
  localizedDescription: LocalizedCatalogueText;
  priceMinor: number | null;
  currency: string | null;
  localizedPriceText: LocalizedCatalogueText;
  availability: "available" | "unavailable" | "seasonal" | "contact";
  options: readonly Record<string, unknown>[];
  actionReference: CatalogueActionReference | null;
  attributes: Record<string, unknown>;
}>;

async function knowledgeAuthority(sql: postgres.TransactionSql, tenantId: string) {
  const rows = await sql<{ allowed: boolean; collectionLimit: number | null }[]>`
    WITH current_authority AS (
      SELECT snapshot.resolved_json
      FROM tenancy.product_subscriptions subscription
      JOIN LATERAL (SELECT candidate.resolved_json, candidate.access_mode
        FROM tenancy.entitlement_snapshots candidate
        WHERE candidate.tenant_id = subscription.tenant_id AND candidate.subscription_id = subscription.id
        ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1) snapshot ON true
      WHERE subscription.tenant_id = ${tenantId}::uuid AND subscription.product_key IN ('ai_chat', 'voice')
        AND subscription.status IN ('active', 'trialing', 'scheduled_change') AND snapshot.access_mode = 'active'
        AND snapshot.resolved_json->'entitlements'->>'knowledge.enabled' = 'true'
    ) SELECT EXISTS(SELECT 1 FROM current_authority) AS allowed,
      CASE WHEN EXISTS(SELECT 1 FROM current_authority WHERE jsonb_typeof(resolved_json->'limits'->'knowledge_collections') <> 'number')
        THEN NULL ELSE (SELECT max((resolved_json->'limits'->>'knowledge_collections')::int) FROM current_authority) END AS "collectionLimit"
  `;
  return rows[0] ?? { allowed: false, collectionLimit: 0 };
}

async function structuredCatalogueAllowed(sql: postgres.TransactionSql, tenantId: string) {
  const rows = await sql<{ allowed: boolean }[]>`SELECT EXISTS(
    SELECT 1 FROM tenancy.product_subscriptions subscription
    JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
    JOIN LATERAL (SELECT candidate.access_mode FROM tenancy.entitlement_snapshots candidate
      WHERE candidate.tenant_id = subscription.tenant_id AND candidate.subscription_id = subscription.id
      ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1) snapshot ON true
    WHERE subscription.tenant_id = ${tenantId}::uuid AND subscription.product_key = 'ai_chat'
      AND subscription.status IN ('active', 'trialing', 'scheduled_change') AND snapshot.access_mode = 'active'
      AND plan.plan_key = 'ai_chat_premium'
  ) AS allowed`;
  return rows[0]?.allowed === true;
}

async function websiteCrawlAuthority(sql: postgres.TransactionSql, tenantId: string) {
  const rows = await sql<{ pageLimit: number }[]>`SELECT CASE WHEN bool_or(plan.plan_key = 'ai_chat_premium') THEN 25 ELSE 1 END::int AS "pageLimit"
    FROM tenancy.product_subscriptions subscription
    JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id
    JOIN LATERAL (SELECT candidate.access_mode, candidate.resolved_json FROM tenancy.entitlement_snapshots candidate
      WHERE candidate.tenant_id = subscription.tenant_id AND candidate.subscription_id = subscription.id
      ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1) snapshot ON true
    WHERE subscription.tenant_id = ${tenantId}::uuid AND subscription.product_key = 'ai_chat'
      AND subscription.status IN ('active', 'trialing', 'scheduled_change') AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>'knowledge.enabled' = 'true'
    HAVING count(*) > 0`;
  return rows[0]?.pageLimit ?? 0;
}

async function publishCatalogueSource(
  sql: postgres.TransactionSql,
  context: TenantContext,
  collectionId: string,
) {
  const collection = await sql<{ name: string }[]>`SELECT name FROM tenancy.knowledge_collections
    WHERE tenant_id = ${context.tenantId}::uuid AND id = ${collectionId}::uuid AND status = 'active'`;
  if (!collection[0]) return null;
  const sourceRows = await sql<{ sourceId: string }[]>`SELECT source_id AS "sourceId"
    FROM tenancy.knowledge_catalog_sources
    WHERE tenant_id = ${context.tenantId}::uuid AND collection_id = ${collectionId}::uuid`;
  let sourceId = sourceRows[0]?.sourceId;
  if (!sourceId) {
    sourceId = randomUUID();
    await sql`INSERT INTO tenancy.knowledge_sources (id, tenant_id, name, source_kind, created_by_membership_id)
      VALUES (${sourceId}::uuid, ${context.tenantId}::uuid, ${`Catalogue - ${collection[0].name}`}, 'structured', ${context.membershipId}::uuid)`;
    await sql`INSERT INTO tenancy.knowledge_collection_sources (tenant_id, collection_id, source_id)
      VALUES (${context.tenantId}::uuid, ${collectionId}::uuid, ${sourceId}::uuid)`;
    await sql`INSERT INTO tenancy.knowledge_catalog_sources (tenant_id, collection_id, source_id)
      VALUES (${context.tenantId}::uuid, ${collectionId}::uuid, ${sourceId}::uuid)`;
  }
  const contentRows = await sql<{ content: string }[]>`SELECT jsonb_build_object(
      'kind', version.item_kind, 'externalKey', item.external_key, 'categoryKey', version.category_key,
      'name', version.localized_name, 'description', version.localized_description,
      'priceMinor', version.price_minor, 'currency', version.currency,
      'priceText', version.localized_price_text, 'availability', version.availability,
      'options', version.options, 'actionReference', version.action_reference,
      'attributes', version.attributes)::text AS content
    FROM tenancy.knowledge_catalog_items item
    JOIN tenancy.knowledge_catalog_item_versions version
      ON version.tenant_id = item.tenant_id AND version.item_id = item.id AND version.id = item.published_version_id
    WHERE item.tenant_id = ${context.tenantId}::uuid AND item.collection_id = ${collectionId}::uuid
      AND item.status = 'active' ORDER BY item.external_key`;
  const content = contentRows.map((row) => row.content).join("\n");
  const versions = await sql<{ version: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS version
    FROM tenancy.knowledge_source_revisions WHERE tenant_id = ${context.tenantId}::uuid AND source_id = ${sourceId}::uuid`;
  const revisionId = randomUUID();
  await sql`INSERT INTO tenancy.knowledge_source_revisions
    (id, tenant_id, source_id, version, content_text, checksum, provenance_json, created_by_membership_id)
    VALUES (${revisionId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, ${versions[0]!.version},
      ${content}, digest(${content}, 'sha256'),
      ${sql.json({ kind: "structured_catalog", collectionId, publicationMode: "published_versions_only" } as never)},
      ${context.membershipId}::uuid)`;
  for (const [index, chunk] of contentRows.entries()) await sql`INSERT INTO tenancy.knowledge_chunks
    (tenant_id, source_revision_id, sequence, content_text, content_hash) VALUES
    (${context.tenantId}::uuid, ${revisionId}::uuid, ${index + 1}, ${chunk.content}, digest(${chunk.content}, 'sha256'))`;
  const changed = await sql<{ agentId: string }[]>`UPDATE tenancy.ai_playbook_drafts draft SET
      knowledge_revision_ids = ARRAY(
        SELECT value FROM (
          SELECT unnest(draft.knowledge_revision_ids) AS value
          EXCEPT
          SELECT old_revision.id FROM tenancy.knowledge_source_revisions old_revision
          WHERE old_revision.tenant_id = draft.tenant_id AND old_revision.source_id = ${sourceId}::uuid
        ) retained
        UNION SELECT ${revisionId}::uuid WHERE ${contentRows.length > 0}
      ), revision = draft.revision + 1, updated_at = now()
    FROM tenancy.knowledge_catalog_agent_bindings binding
    WHERE binding.tenant_id = ${context.tenantId}::uuid AND binding.collection_id = ${collectionId}::uuid
      AND draft.tenant_id = binding.tenant_id AND draft.agent_id = binding.agent_id
    RETURNING draft.agent_id AS "agentId"`;
  return { revisionId, affectedAgentDrafts: changed.length };
}

async function saveCatalogueDraftVersion(
  sql: postgres.TransactionSql,
  context: TenantContext,
  input: KnowledgeCatalogueDraft,
) {
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.collectionId}:${input.externalKey}`}, 0))`;
  const existing = await sql<{ id: string; nextVersion: number }[]>`SELECT item.id,
    COALESCE(max(version.version), 0)::int + 1 AS "nextVersion"
    FROM tenancy.knowledge_catalog_items item
    LEFT JOIN tenancy.knowledge_catalog_item_versions version
      ON version.tenant_id = item.tenant_id AND version.item_id = item.id
    WHERE item.tenant_id = ${context.tenantId}::uuid AND item.collection_id = ${input.collectionId}::uuid
      AND item.external_key = ${input.externalKey} GROUP BY item.id`;
  const itemId = existing[0]?.id ?? randomUUID();
  const versionId = randomUUID();
  const version = existing[0]?.nextVersion ?? 1;
  if (!existing[0]) await sql`INSERT INTO tenancy.knowledge_catalog_items
    (id, tenant_id, collection_id, item_kind, external_key, name, description, price_minor, currency,
     attributes, status, latest_version_id)
    VALUES (${itemId}::uuid, ${context.tenantId}::uuid, ${input.collectionId}::uuid, ${input.itemKind},
      ${input.externalKey}, ${input.localizedName.en}, ${input.localizedDescription.en}, ${input.priceMinor},
      ${input.currency}, ${sql.json(input.attributes as never)}, 'active', ${versionId}::uuid)`;
  await sql`INSERT INTO tenancy.knowledge_catalog_item_versions
    (id, tenant_id, item_id, version, item_kind, category_key, localized_name, localized_description,
     price_minor, currency, localized_price_text, availability, options, action_reference, attributes,
     created_by_membership_id)
    VALUES (${versionId}::uuid, ${context.tenantId}::uuid, ${itemId}::uuid, ${version}, ${input.itemKind},
      ${input.categoryKey}, ${sql.json(input.localizedName as never)}, ${sql.json(input.localizedDescription as never)},
      ${input.priceMinor}, ${input.currency}, ${sql.json(input.localizedPriceText as never)}, ${input.availability},
      ${sql.json(input.options as never)}, ${input.actionReference ? sql.json(input.actionReference as never) : null},
      ${sql.json(input.attributes as never)}, ${context.membershipId}::uuid)`;
  if (existing[0]) await sql`UPDATE tenancy.knowledge_catalog_items SET item_kind = ${input.itemKind},
    name = ${input.localizedName.en}, description = ${input.localizedDescription.en}, price_minor = ${input.priceMinor},
    currency = ${input.currency}, attributes = ${sql.json(input.attributes as never)}, status = 'active',
    latest_version_id = ${versionId}::uuid, archived_at = NULL, updated_at = now()
    WHERE tenant_id = ${context.tenantId}::uuid AND id = ${itemId}::uuid`;
  return { itemId, versionId, version };
}

export class TenantKnowledgeIngestionStore {
  constructor(private readonly client: DatabaseClient) {}

  async hasStructuredCatalogue(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => structuredCatalogueAllowed(sql, context.tenantId));
  }

  async listCollections(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; description: string; status: string; sourceCount: number; itemCount: number; createdAt: Date;
    }[]>`
      SELECT collection.id, collection.name, collection.description, collection.status,
        count(DISTINCT link.source_id)::int AS "sourceCount", count(DISTINCT item.id)::int AS "itemCount",
        collection.created_at AS "createdAt"
      FROM tenancy.knowledge_collections collection
      LEFT JOIN tenancy.knowledge_collection_sources link ON link.tenant_id = collection.tenant_id AND link.collection_id = collection.id
      LEFT JOIN tenancy.knowledge_catalog_items item ON item.tenant_id = collection.tenant_id AND item.collection_id = collection.id AND item.status = 'active'
      WHERE collection.tenant_id = ${context.tenantId}::uuid AND collection.status = 'active'
      GROUP BY collection.id ORDER BY collection.updated_at DESC, collection.id
    `);
  }

  async createCollection(context: TenantContext, input: Readonly<{ name: string; description: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await knowledgeAuthority(sql, context.tenantId);
      if (!authority.allowed) return { status: "not_entitled" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:knowledge:collections`}, 0))`;
      const count = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM tenancy.knowledge_collections WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'`;
      if (authority.collectionLimit !== null && (count[0]?.count ?? 0) >= authority.collectionLimit) return { status: "limit_reached" as const };
      const collectionId = randomUUID();
      await sql`INSERT INTO tenancy.knowledge_collections (id, tenant_id, name, description, created_by_membership_id)
        VALUES (${collectionId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.description}, ${context.membershipId}::uuid)`;
      return { status: "created" as const, collectionId };
    });
  }

  async requestCrawl(context: TenantContext, input: Readonly<{
    collectionId: string; name: string; url: string; refreshIntervalHours: number | null;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const pageLimit = await websiteCrawlAuthority(sql, context.tenantId);
      if (!pageLimit) return { status: "not_entitled" as const };
      const collection = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_collections
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.collectionId}::uuid AND status = 'active') AS exists`;
      if (!collection[0]?.exists) return { status: "not_found" as const };
      const sourceId = randomUUID(); const jobId = randomUUID();
      await sql`INSERT INTO tenancy.knowledge_sources (id, tenant_id, name, source_kind, source_url,
        crawl_page_limit, refresh_interval_hours, next_refresh_at, created_by_membership_id) VALUES (${sourceId}::uuid,
        ${context.tenantId}::uuid, ${input.name}, 'url', ${input.url}, ${pageLimit}, ${input.refreshIntervalHours}, now(), ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.knowledge_collection_sources (tenant_id, collection_id, source_id)
        VALUES (${context.tenantId}::uuid, ${input.collectionId}::uuid, ${sourceId}::uuid)`;
      await sql`INSERT INTO tenancy.knowledge_ingestion_jobs (id, tenant_id, source_id, job_kind, requested_by_membership_id)
        VALUES (${jobId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, 'url_crawl', ${context.membershipId}::uuid)`;
      return { status: "queued" as const, sourceId, jobId, crawlMode: pageLimit === 1 ? "single_page" as const : "same_scope" as const, pageLimit };
    });
  }

  async initiateUpload(context: TenantContext, input: Readonly<{
    collectionId: string; name: string; filename: string; mediaType: KnowledgeMediaType; size: number;
  }>) {
    const mediaType = mediaTypeSchema.parse(input.mediaType);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await knowledgeAuthority(sql, context.tenantId);
      if (!authority.allowed) return { status: "not_entitled" as const };
      const collection = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_collections
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.collectionId}::uuid AND status = 'active') AS exists`;
      if (!collection[0]?.exists) return { status: "not_found" as const };
      const sourceId = randomUUID(); const objectId = randomUUID(); const jobId = randomUUID();
      const objectKey = `knowledge/${context.tenantId}/${sourceId}/${objectId}`;
      await sql`INSERT INTO tenancy.knowledge_sources (id, tenant_id, name, source_kind, created_by_membership_id)
        VALUES (${sourceId}::uuid, ${context.tenantId}::uuid, ${input.name}, 'file', ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.knowledge_collection_sources (tenant_id, collection_id, source_id)
        VALUES (${context.tenantId}::uuid, ${input.collectionId}::uuid, ${sourceId}::uuid)`;
      await sql`INSERT INTO tenancy.knowledge_objects (id, tenant_id, source_id, object_key, original_filename, media_type, declared_size)
        VALUES (${objectId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, ${objectKey}, ${input.filename}, ${mediaType}, ${input.size})`;
      await sql`INSERT INTO tenancy.knowledge_ingestion_jobs (id, tenant_id, source_id, object_id, job_kind, status, requested_by_membership_id)
        VALUES (${jobId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, ${objectId}::uuid, 'file_extract', 'waiting_upload', ${context.membershipId}::uuid)`;
      return { status: "created" as const, sourceId, objectId, jobId, objectKey, mediaType };
    });
  }

  async completeUpload(context: TenantContext, objectId: string, observedSize: number) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ jobId: string }[]>`WITH changed AS (
        UPDATE tenancy.knowledge_objects SET status = 'uploaded', observed_size = ${observedSize}, uploaded_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${objectId}::uuid AND status = 'pending_upload'
          AND declared_size = ${observedSize} RETURNING id
      ) UPDATE tenancy.knowledge_ingestion_jobs job SET status = 'pending', available_at = now()
        FROM changed WHERE job.tenant_id = ${context.tenantId}::uuid AND job.object_id = changed.id AND job.status = 'waiting_upload'
        RETURNING job.id AS "jobId"`;
      return rows[0] ? { status: "queued" as const, jobId: rows[0].jobId } : { status: "not_completable" as const };
    });
  }

  async pendingUpload(context: TenantContext, objectId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ objectKey: string; mediaType: KnowledgeMediaType; declaredSize: number }[]>`
        SELECT object_key AS "objectKey", media_type AS "mediaType", declared_size::int AS "declaredSize"
        FROM tenancy.knowledge_objects WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${objectId}::uuid AND status = 'pending_upload'
      `;
      return rows[0] ?? null;
    });
  }

  async getSource(context: TenantContext, sourceId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; name: string; sourceKind: string; sourceUrl: string | null; status: "active" | "archived" | "erased";
        version: number; revisionId: string | null; revisionStatus: string | null; content: string; contentTruncated: boolean;
        provenance: Record<string, unknown>; chunkCount: number; createdAt: Date; updatedAt: Date;
      }[]>`SELECT source.id, source.name, source.source_kind AS "sourceKind", source.source_url AS "sourceUrl", source.status,
        COALESCE(revision.version, 0)::int AS version, revision.id AS "revisionId", revision.status AS "revisionStatus",
        left(COALESCE(revision.content_text, ''), 100000) AS content,
        char_length(COALESCE(revision.content_text, '')) > 100000 AS "contentTruncated",
        COALESCE(revision.provenance_json, '{}'::jsonb) AS provenance,
        COALESCE((SELECT count(*)::int FROM tenancy.knowledge_chunks chunk
          WHERE chunk.tenant_id = revision.tenant_id AND chunk.source_revision_id = revision.id), 0)::int AS "chunkCount",
        source.created_at AS "createdAt", source.updated_at AS "updatedAt"
        FROM tenancy.knowledge_sources source
        LEFT JOIN LATERAL (SELECT candidate.* FROM tenancy.knowledge_source_revisions candidate
          WHERE candidate.tenant_id = source.tenant_id AND candidate.source_id = source.id
          ORDER BY candidate.version DESC LIMIT 1) revision ON true
        WHERE source.tenant_id = ${context.tenantId}::uuid AND source.id = ${sourceId}::uuid AND source.status <> 'erased'`;
      return rows[0] ?? null;
    });
  }

  async setSourceInclusion(context: TenantContext, sourceId: string, included: boolean) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (included && !(await knowledgeAuthority(sql, context.tenantId)).allowed) return { status: "not_entitled" as const };
      const rows = await sql<{ status: "active" | "archived" }[]>`UPDATE tenancy.knowledge_sources SET
        status = ${included ? "active" : "archived"}, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${sourceId}::uuid AND status <> 'erased'
        RETURNING status`;
      return rows[0] ? { status: included ? "included" as const : "excluded" as const } : { status: "not_found" as const };
    });
  }

  async reviseSource(context: TenantContext, sourceId: string, input: Readonly<{ name: string; content: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await knowledgeAuthority(sql, context.tenantId)).allowed) return { status: "not_entitled" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:knowledge-source:${sourceId}`}, 0))`;
      const source = await sql<{ sourceKind: string; nextVersion: number }[]>`SELECT source.source_kind AS "sourceKind",
        COALESCE(max(revision.version), 0)::int + 1 AS "nextVersion"
        FROM tenancy.knowledge_sources source LEFT JOIN tenancy.knowledge_source_revisions revision
          ON revision.tenant_id = source.tenant_id AND revision.source_id = source.id
        WHERE source.tenant_id = ${context.tenantId}::uuid AND source.id = ${sourceId}::uuid AND source.status <> 'erased'
        GROUP BY source.id`;
      if (!source[0]) return { status: "not_found" as const };
      const revisionId = randomUUID(); const chunks = chunkKnowledge(input.content);
      await sql`UPDATE tenancy.knowledge_sources SET name = ${input.name}, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${sourceId}::uuid`;
      await sql`INSERT INTO tenancy.knowledge_source_revisions
        (id, tenant_id, source_id, version, content_text, checksum, status, provenance_json, created_by_membership_id)
        VALUES (${revisionId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, ${source[0].nextVersion}, ${input.content},
          ${createHash("sha256").update(input.content).digest()}, 'ready',
          ${sql.json({ kind: "merchant_correction", correctedAt: new Date().toISOString(), previousSourceKind: source[0].sourceKind } as never)},
          ${context.membershipId}::uuid)`;
      for (const [index, content] of chunks.entries()) await sql`INSERT INTO tenancy.knowledge_chunks
        (tenant_id, source_revision_id, sequence, content_text, content_hash) VALUES
        (${context.tenantId}::uuid, ${revisionId}::uuid, ${index + 1}, ${content}, ${createHash("sha256").update(content).digest()})`;
      const changed = await sql<{ agentId: string }[]>`UPDATE tenancy.ai_playbook_drafts draft SET
        knowledge_revision_ids = ARRAY(SELECT value FROM (
          SELECT unnest(draft.knowledge_revision_ids) AS value EXCEPT
          SELECT revision.id FROM tenancy.knowledge_source_revisions revision
            WHERE revision.tenant_id = draft.tenant_id AND revision.source_id = ${sourceId}::uuid
        ) retained UNION SELECT ${revisionId}::uuid), revision = draft.revision + 1, updated_at = now()
        WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.knowledge_revision_ids && ARRAY(
          SELECT revision.id FROM tenancy.knowledge_source_revisions revision
          WHERE revision.tenant_id = ${context.tenantId}::uuid AND revision.source_id = ${sourceId}::uuid)
        RETURNING draft.agent_id AS "agentId"`;
      return { status: "corrected" as const, revisionId, version: source[0].nextVersion, affectedAgentDrafts: changed.length };
    });
  }

  async reprocessSource(context: TenantContext, sourceId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await knowledgeAuthority(sql, context.tenantId)).allowed) return { status: "not_entitled" as const };
      const source = await sql<{ sourceKind: string; objectId: string | null }[]>`SELECT source.source_kind AS "sourceKind",
        (SELECT object.id FROM tenancy.knowledge_objects object WHERE object.tenant_id = source.tenant_id
          AND object.source_id = source.id AND object.status NOT IN ('infected', 'deleted') ORDER BY object.created_at DESC LIMIT 1) AS "objectId"
        FROM tenancy.knowledge_sources source WHERE source.tenant_id = ${context.tenantId}::uuid
          AND source.id = ${sourceId}::uuid AND source.status <> 'erased' FOR UPDATE`;
      if (!source[0]) return { status: "not_found" as const };
      const jobKind = source[0].sourceKind === "url" ? "url_crawl" : source[0].sourceKind === "file" ? "file_extract" : null;
      if (!jobKind || (jobKind === "file_extract" && !source[0].objectId)) return { status: "not_reprocessable" as const };
      const existing = await sql<{ id: string }[]>`SELECT id FROM tenancy.knowledge_ingestion_jobs WHERE tenant_id = ${context.tenantId}::uuid
        AND source_id = ${sourceId}::uuid AND status IN ('waiting_upload', 'pending', 'processing', 'failed') ORDER BY created_at DESC LIMIT 1`;
      if (existing[0]) return { status: "already_queued" as const, jobId: existing[0].id };
      const jobId = randomUUID();
      await sql`INSERT INTO tenancy.knowledge_ingestion_jobs
        (id, tenant_id, source_id, object_id, job_kind, requested_by_membership_id)
        VALUES (${jobId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, ${source[0].objectId}::uuid,
          ${jobKind}, ${context.membershipId}::uuid)`;
      return { status: "queued" as const, jobId };
    });
  }

  async reindexSource(context: TenantContext, sourceId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await knowledgeAuthority(sql, context.tenantId)).allowed) return { status: "not_entitled" as const };
      const source = await sql<{ name: string; content: string }[]>`SELECT source.name, revision.content_text AS content
        FROM tenancy.knowledge_sources source JOIN LATERAL (SELECT candidate.content_text
          FROM tenancy.knowledge_source_revisions candidate WHERE candidate.tenant_id = source.tenant_id
            AND candidate.source_id = source.id AND candidate.status = 'ready' ORDER BY candidate.version DESC LIMIT 1) revision ON true
        WHERE source.tenant_id = ${context.tenantId}::uuid AND source.id = ${sourceId}::uuid AND source.status <> 'erased'`;
      if (!source[0]) return { status: "not_found" as const };
      return this.reviseSourceInTransaction(sql, context, sourceId, source[0].name, source[0].content, "full_reindex");
    });
  }

  private async reviseSourceInTransaction(sql: postgres.TransactionSql, context: TenantContext, sourceId: string,
    name: string, content: string, kind: "full_reindex") {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:knowledge-source:${sourceId}`}, 0))`;
    const version = await sql<{ nextVersion: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS "nextVersion"
      FROM tenancy.knowledge_source_revisions WHERE tenant_id = ${context.tenantId}::uuid AND source_id = ${sourceId}::uuid`;
    const revisionId = randomUUID(); const chunks = chunkKnowledge(content);
    await sql`INSERT INTO tenancy.knowledge_source_revisions
      (id, tenant_id, source_id, version, content_text, checksum, status, provenance_json, created_by_membership_id)
      VALUES (${revisionId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, ${version[0]!.nextVersion}, ${content},
        ${createHash("sha256").update(content).digest()}, 'ready', ${sql.json({ kind, reindexedAt: new Date().toISOString() } as never)},
        ${context.membershipId}::uuid)`;
    for (const [index, chunk] of chunks.entries()) await sql`INSERT INTO tenancy.knowledge_chunks
      (tenant_id, source_revision_id, sequence, content_text, content_hash) VALUES
      (${context.tenantId}::uuid, ${revisionId}::uuid, ${index + 1}, ${chunk}, ${createHash("sha256").update(chunk).digest()})`;
    const changed = await sql<{ agentId: string }[]>`UPDATE tenancy.ai_playbook_drafts draft SET
      knowledge_revision_ids = ARRAY(SELECT value FROM (SELECT unnest(draft.knowledge_revision_ids) AS value EXCEPT
        SELECT revision.id FROM tenancy.knowledge_source_revisions revision WHERE revision.tenant_id = draft.tenant_id
          AND revision.source_id = ${sourceId}::uuid) retained UNION SELECT ${revisionId}::uuid),
      revision = draft.revision + 1, updated_at = now()
      WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.knowledge_revision_ids && ARRAY(
        SELECT revision.id FROM tenancy.knowledge_source_revisions revision WHERE revision.tenant_id = ${context.tenantId}::uuid
          AND revision.source_id = ${sourceId}::uuid) RETURNING draft.agent_id AS "agentId"`;
    return { status: "reindexed" as const, revisionId, version: version[0]!.nextVersion, affectedAgentDrafts: changed.length, name };
  }

  async deleteSource(context: TenantContext, sourceId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ id: string }[]>`UPDATE tenancy.knowledge_sources SET status = 'erased', updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${sourceId}::uuid AND status <> 'erased' RETURNING id`;
      if (!rows[0]) return { status: "not_found" as const };
      await sql`UPDATE tenancy.knowledge_objects SET status = 'deleted', safe_error_code = NULL
        WHERE tenant_id = ${context.tenantId}::uuid AND source_id = ${sourceId}::uuid AND status <> 'deleted'`;
      await sql`UPDATE tenancy.knowledge_ingestion_jobs SET status = 'dead_letter', safe_error_code = 'source_deleted',
        locked_at = NULL, completed_at = now() WHERE tenant_id = ${context.tenantId}::uuid AND source_id = ${sourceId}::uuid
        AND status NOT IN ('succeeded', 'dead_letter')`;
      const changed = await sql<{ agentId: string }[]>`UPDATE tenancy.ai_playbook_drafts draft SET
        knowledge_revision_ids = ARRAY(SELECT value FROM (SELECT unnest(draft.knowledge_revision_ids) AS value EXCEPT
          SELECT revision.id FROM tenancy.knowledge_source_revisions revision WHERE revision.tenant_id = draft.tenant_id
            AND revision.source_id = ${sourceId}::uuid) retained), revision = draft.revision + 1, updated_at = now()
        WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.knowledge_revision_ids && ARRAY(
          SELECT revision.id FROM tenancy.knowledge_source_revisions revision WHERE revision.tenant_id = ${context.tenantId}::uuid
            AND revision.source_id = ${sourceId}::uuid) RETURNING draft.agent_id AS "agentId"`;
      return { status: "deleted" as const, affectedAgentDrafts: changed.length };
    });
  }

  async saveCatalogDraft(context: TenantContext, input: KnowledgeCatalogueDraft) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await structuredCatalogueAllowed(sql, context.tenantId))) return { status: "not_entitled" as const };
      const collection = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_collections
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.collectionId}::uuid AND status = 'active') AS exists`;
      if (!collection[0]?.exists) return { status: "not_found" as const };
      return { status: "saved_draft" as const, ...await saveCatalogueDraftVersion(sql, context, input) };
    });
  }

  async importCatalogDrafts(context: TenantContext, collectionId: string, items: readonly Omit<KnowledgeCatalogueDraft, "collectionId">[]) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await structuredCatalogueAllowed(sql, context.tenantId))) return { status: "not_entitled" as const };
      if (items.length < 1 || items.length > 200 || new Set(items.map((item) => item.externalKey)).size !== items.length) {
        return { status: "validation_failed" as const };
      }
      const collection = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_collections
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${collectionId}::uuid AND status = 'active') AS exists`;
      if (!collection[0]?.exists) return { status: "not_found" as const };
      const saved: { itemId: string; versionId: string; version: number }[] = [];
      for (const item of items) saved.push(await saveCatalogueDraftVersion(sql, context, { ...item, collectionId }));
      return { status: "imported_drafts" as const, count: saved.length, items: saved };
    });
  }

  async publishCatalogItem(context: TenantContext, itemId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await structuredCatalogueAllowed(sql, context.tenantId))) return { status: "not_entitled" as const };
      const rows = await sql<{ collectionId: string; versionId: string; version: number }[]>`UPDATE tenancy.knowledge_catalog_items item
        SET published_version_id = item.latest_version_id, status = 'active', archived_at = NULL, updated_at = now()
        FROM tenancy.knowledge_catalog_item_versions version
        WHERE item.tenant_id = ${context.tenantId}::uuid AND item.id = ${itemId}::uuid
          AND (item.published_version_id IS DISTINCT FROM item.latest_version_id OR item.status <> 'active')
          AND version.tenant_id = item.tenant_id AND version.item_id = item.id AND version.id = item.latest_version_id
        RETURNING item.collection_id AS "collectionId", version.id AS "versionId", version.version`;
      if (!rows[0]) {
        const existing = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_catalog_items
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${itemId}::uuid) AS exists`;
        return existing[0]?.exists ? { status: "unchanged" as const, itemId } : { status: "not_found" as const };
      }
      const publication = await publishCatalogueSource(sql, context, rows[0].collectionId);
      return { status: "published" as const, itemId, versionId: rows[0].versionId, version: rows[0].version, ...publication! };
    });
  }

  async archiveCatalogItem(context: TenantContext, itemId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await structuredCatalogueAllowed(sql, context.tenantId))) return { status: "not_entitled" as const };
      const rows = await sql<{ collectionId: string }[]>`UPDATE tenancy.knowledge_catalog_items SET
        published_version_id = NULL, status = 'archived', archived_at = now(), updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${itemId}::uuid
          AND (status <> 'archived' OR published_version_id IS NOT NULL)
        RETURNING collection_id AS "collectionId"`;
      if (!rows[0]) {
        const existing = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_catalog_items
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${itemId}::uuid) AS exists`;
        return existing[0]?.exists ? { status: "unchanged" as const, itemId } : { status: "not_found" as const };
      }
      const publication = await publishCatalogueSource(sql, context, rows[0].collectionId);
      return { status: "archived" as const, itemId, ...publication! };
    });
  }

  async listCatalogAgentBindings(context: TenantContext, collectionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      agentId: string; name: string; businessName: string; bound: boolean;
    }[]>`SELECT agent.id AS "agentId", agent.name,
      COALESCE(draft.definition_json->>'businessName', '') AS "businessName",
      (binding.agent_id IS NOT NULL) AS bound
      FROM tenancy.ai_agents agent
      JOIN tenancy.ai_playbook_drafts draft ON draft.tenant_id = agent.tenant_id AND draft.agent_id = agent.id
      LEFT JOIN tenancy.knowledge_catalog_agent_bindings binding
        ON binding.tenant_id = agent.tenant_id AND binding.agent_id = agent.id
        AND binding.collection_id = ${collectionId}::uuid
      WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.status <> 'archived'
      ORDER BY agent.created_at, agent.id`);
  }

  async setCatalogAgentBindings(context: TenantContext, collectionId: string, agentIds: readonly string[]) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await structuredCatalogueAllowed(sql, context.tenantId))) return { status: "not_entitled" as const };
      const uniqueAgentIds = [...new Set(agentIds)];
      if (uniqueAgentIds.length !== agentIds.length || uniqueAgentIds.length > 3) return { status: "invalid_agents" as const };
      const valid = await sql<{ collectionExists: boolean; agentCount: number }[]>`SELECT
        EXISTS(SELECT 1 FROM tenancy.knowledge_collections WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${collectionId}::uuid AND status = 'active') AS "collectionExists",
        (SELECT count(*)::int FROM tenancy.ai_agents WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ANY(${uniqueAgentIds}::uuid[]) AND status <> 'archived') AS "agentCount"`;
      if (!valid[0]?.collectionExists) return { status: "not_found" as const };
      if (valid[0].agentCount !== uniqueAgentIds.length) return { status: "invalid_agents" as const };
      const previous = await sql<{ agentId: string }[]>`SELECT agent_id AS "agentId"
        FROM tenancy.knowledge_catalog_agent_bindings WHERE tenant_id = ${context.tenantId}::uuid
          AND collection_id = ${collectionId}::uuid`;
      await sql`DELETE FROM tenancy.knowledge_catalog_agent_bindings WHERE tenant_id = ${context.tenantId}::uuid
        AND collection_id = ${collectionId}::uuid AND NOT (agent_id = ANY(${uniqueAgentIds}::uuid[]))`;
      for (const agentId of uniqueAgentIds) await sql`INSERT INTO tenancy.knowledge_catalog_agent_bindings
        (tenant_id, collection_id, agent_id, created_by_membership_id)
        VALUES (${context.tenantId}::uuid, ${collectionId}::uuid, ${agentId}::uuid, ${context.membershipId}::uuid)
        ON CONFLICT (tenant_id, collection_id, agent_id) DO NOTHING`;
      const sources = await sql<{ sourceId: string; revisionId: string | null }[]>`SELECT source.source_id AS "sourceId",
        (SELECT revision.id FROM tenancy.knowledge_source_revisions revision
          WHERE revision.tenant_id = source.tenant_id AND revision.source_id = source.source_id
            AND revision.status = 'ready' AND revision.content_text <> ''
          ORDER BY revision.version DESC LIMIT 1) AS "revisionId"
        FROM tenancy.knowledge_catalog_sources source
        WHERE source.tenant_id = ${context.tenantId}::uuid AND source.collection_id = ${collectionId}::uuid`;
      const source = sources[0];
      if (source) {
        const affectedAgentIds = [...new Set([...previous.map((item) => item.agentId), ...uniqueAgentIds])];
        for (const agentId of affectedAgentIds) {
          const shouldBind = uniqueAgentIds.includes(agentId) && source.revisionId !== null;
          await sql`WITH candidate AS (SELECT draft.tenant_id, draft.agent_id, ARRAY(
                SELECT value FROM (
                  SELECT unnest(draft.knowledge_revision_ids) AS value
                  EXCEPT SELECT revision.id FROM tenancy.knowledge_source_revisions revision
                    WHERE revision.tenant_id = draft.tenant_id AND revision.source_id = ${source.sourceId}::uuid
                ) retained
                UNION SELECT ${source.revisionId}::uuid WHERE ${shouldBind}
              ) AS next_pins
              FROM tenancy.ai_playbook_drafts draft
              WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.agent_id = ${agentId}::uuid)
            UPDATE tenancy.ai_playbook_drafts draft SET knowledge_revision_ids = candidate.next_pins,
              revision = draft.revision + 1, updated_at = now()
            FROM candidate WHERE draft.tenant_id = candidate.tenant_id AND draft.agent_id = candidate.agent_id
              AND draft.knowledge_revision_ids IS DISTINCT FROM candidate.next_pins`;
        }
      }
      return { status: "saved" as const, agentIds: uniqueAgentIds };
    });
  }

  async listCatalogItems(context: TenantContext, collectionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; itemKind: "product" | "service"; externalKey: string; categoryKey: string | null;
      localizedName: LocalizedCatalogueText; localizedDescription: LocalizedCatalogueText;
      priceMinor: number | null; currency: string | null; localizedPriceText: LocalizedCatalogueText;
      availability: KnowledgeCatalogueDraft["availability"]; options: Record<string, unknown>[];
      actionReference: CatalogueActionReference | null; attributes: Record<string, unknown>;
      status: "draft" | "published" | "published_with_draft" | "archived"; latestVersion: number; publishedVersion: number | null;
    }[]>`SELECT item.id, version.item_kind AS "itemKind", item.external_key AS "externalKey",
      version.category_key AS "categoryKey", version.localized_name AS "localizedName",
      version.localized_description AS "localizedDescription", version.price_minor::int AS "priceMinor",
      version.currency, version.localized_price_text AS "localizedPriceText", version.availability,
      version.options, version.action_reference AS "actionReference", version.attributes,
      CASE WHEN item.status = 'archived' THEN 'archived'
        WHEN item.published_version_id IS NULL THEN 'draft'
        WHEN item.published_version_id = item.latest_version_id THEN 'published'
        ELSE 'published_with_draft' END AS status,
      version.version AS "latestVersion", published.version AS "publishedVersion"
      FROM tenancy.knowledge_catalog_items item
      JOIN tenancy.knowledge_catalog_item_versions version
        ON version.tenant_id = item.tenant_id AND version.item_id = item.id AND version.id = item.latest_version_id
      LEFT JOIN tenancy.knowledge_catalog_item_versions published
        ON published.tenant_id = item.tenant_id AND published.item_id = item.id AND published.id = item.published_version_id
      WHERE item.tenant_id = ${context.tenantId}::uuid AND item.collection_id = ${collectionId}::uuid
      ORDER BY item.updated_at DESC, item.id`);
  }
}

const claimSchema = z.object({
  job_id: z.uuid(), tenant_id: z.uuid(), source_id: z.uuid(), object_id: z.uuid().nullable(),
  job_kind: z.enum(["file_extract", "url_crawl", "scheduled_refresh"]), source_url: z.string().nullable(),
  crawl_page_limit: z.number().int().min(1).max(25),
  object_key: z.string().nullable(), media_type: mediaTypeSchema.nullable(), declared_size: z.coerce.number().int().nullable(),
  attempt_count: z.number().int().positive(),
}).strict();
export type KnowledgeIngestionClaim = z.infer<typeof claimSchema>;

export class KnowledgeIngestionWorkerStore {
  constructor(private readonly client: DatabaseClient) {}
  async enqueueDue(limit = 100) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'knowledge_worker', true)`;
      return sql<{ count: number }[]>`SELECT tenancy.enqueue_due_knowledge_refreshes(${limit})::int AS count`;
    });
    return rows[0]?.count ?? 0;
  }
  async reserveCrawlHost(hostname: string, minimumIntervalMs: number) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'knowledge_worker', true)`;
      return sql<{ waitMs: number }[]>`SELECT tenancy.reserve_knowledge_crawl_host(${hostname}, ${minimumIntervalMs})::int AS "waitMs"`;
    });
    return rows[0]?.waitMs ?? 0;
  }
  async claim() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'knowledge_worker', true)`;
      const now = new Date();
      const rows = await sql<Record<string, unknown>[]>`SELECT * FROM tenancy.claim_knowledge_ingestion(${now}, ${new Date(now.getTime() - 5 * 60_000)})`;
      return rows[0] ? claimSchema.parse(rows[0]) : null;
    });
  }
  async complete(input: Readonly<{ jobId: string; content: string; chunks: readonly string[]; provenance: Record<string, unknown>; observedSize?: number; sha256?: Buffer }>) {
    const values = input.chunks.map((content, index) => ({ sequence: index + 1, content }));
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'knowledge_worker', true)`;
      return sql<{ revision_id: string }[]>`SELECT tenancy.complete_knowledge_ingestion(${input.jobId}::uuid, ${input.content},
        ${sql.json(values)}, ${sql.json(input.provenance as never)}, ${input.observedSize ?? null}, ${input.sha256 ?? null}) AS revision_id`;
    });
    return rows[0]?.revision_id ?? null;
  }
  async fail(jobId: string, safeErrorCode: string, retryable: boolean) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'knowledge_worker', true)`;
      return sql<{ changed: boolean }[]>`SELECT tenancy.fail_knowledge_ingestion(${jobId}::uuid, ${safeErrorCode}, ${retryable}) AS changed`;
    });
    return rows[0]?.changed === true;
  }
}
