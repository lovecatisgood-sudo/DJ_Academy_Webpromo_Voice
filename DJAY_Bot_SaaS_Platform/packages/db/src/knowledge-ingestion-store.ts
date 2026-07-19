import { randomUUID } from "node:crypto";
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

export class TenantKnowledgeIngestionStore {
  constructor(private readonly client: DatabaseClient) {}

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
      const authority = await knowledgeAuthority(sql, context.tenantId);
      if (!authority.allowed) return { status: "not_entitled" as const };
      const collection = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.knowledge_collections
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.collectionId}::uuid AND status = 'active') AS exists`;
      if (!collection[0]?.exists) return { status: "not_found" as const };
      const sourceId = randomUUID(); const jobId = randomUUID();
      await sql`INSERT INTO tenancy.knowledge_sources (id, tenant_id, name, source_kind, source_url,
        refresh_interval_hours, next_refresh_at, created_by_membership_id) VALUES (${sourceId}::uuid,
        ${context.tenantId}::uuid, ${input.name}, 'url', ${input.url}, ${input.refreshIntervalHours}, now(), ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.knowledge_collection_sources (tenant_id, collection_id, source_id)
        VALUES (${context.tenantId}::uuid, ${input.collectionId}::uuid, ${sourceId}::uuid)`;
      await sql`INSERT INTO tenancy.knowledge_ingestion_jobs (id, tenant_id, source_id, job_kind, requested_by_membership_id)
        VALUES (${jobId}::uuid, ${context.tenantId}::uuid, ${sourceId}::uuid, 'url_crawl', ${context.membershipId}::uuid)`;
      return { status: "queued" as const, sourceId, jobId };
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

  async upsertCatalogItem(context: TenantContext, input: Readonly<{
    collectionId: string; itemKind: "product" | "service"; externalKey: string; name: string;
    description: string; priceMinor: number | null; currency: string | null; attributes: Record<string, unknown>;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await knowledgeAuthority(sql, context.tenantId);
      if (!authority.allowed) return { status: "not_entitled" as const };
      const rows = await sql<{ id: string }[]>`INSERT INTO tenancy.knowledge_catalog_items
        (tenant_id, collection_id, item_kind, external_key, name, description, price_minor, currency, attributes)
        SELECT ${context.tenantId}::uuid, collection.id, ${input.itemKind}, ${input.externalKey}, ${input.name},
          ${input.description}, ${input.priceMinor}, ${input.currency}, ${sql.json(input.attributes as never)}
        FROM tenancy.knowledge_collections collection WHERE collection.tenant_id = ${context.tenantId}::uuid
          AND collection.id = ${input.collectionId}::uuid AND collection.status = 'active'
        ON CONFLICT (tenant_id, collection_id, external_key) DO UPDATE SET item_kind = EXCLUDED.item_kind,
          name = EXCLUDED.name, description = EXCLUDED.description, price_minor = EXCLUDED.price_minor,
          currency = EXCLUDED.currency, attributes = EXCLUDED.attributes, status = 'active', updated_at = now()
        RETURNING id`;
      if (!rows[0]) return { status: "not_found" as const };
      const existingCatalogSources = await sql<{ sourceId: string }[]>`SELECT source_id AS "sourceId" FROM tenancy.knowledge_catalog_sources
        WHERE tenant_id = ${context.tenantId}::uuid AND collection_id = ${input.collectionId}::uuid`;
      let catalogSourceId = existingCatalogSources[0]?.sourceId;
      if (!catalogSourceId) {
        const sourceId = randomUUID();
        await sql`INSERT INTO tenancy.knowledge_sources (id, tenant_id, name, source_kind, created_by_membership_id)
          VALUES (${sourceId}::uuid, ${context.tenantId}::uuid, ${`Catalogue - ${input.name}`}, 'structured', ${context.membershipId}::uuid)`;
        await sql`INSERT INTO tenancy.knowledge_collection_sources (tenant_id, collection_id, source_id)
          VALUES (${context.tenantId}::uuid, ${input.collectionId}::uuid, ${sourceId}::uuid)`;
        await sql`INSERT INTO tenancy.knowledge_catalog_sources (tenant_id, collection_id, source_id)
          VALUES (${context.tenantId}::uuid, ${input.collectionId}::uuid, ${sourceId}::uuid)`;
        catalogSourceId = sourceId;
      }
      const contentRows = await sql<{ content: string }[]>`SELECT concat_ws(E'\n',
        'Type: ' || item_kind, 'Reference: ' || external_key, 'Name: ' || name, 'Description: ' || description,
        CASE WHEN price_minor IS NULL THEN NULL ELSE 'Price: ' || currency || ' ' || (price_minor::numeric / 100)::text END,
        CASE WHEN attributes = '{}'::jsonb THEN NULL ELSE 'Attributes: ' || attributes::text END) AS content
        FROM tenancy.knowledge_catalog_items WHERE tenant_id = ${context.tenantId}::uuid
          AND collection_id = ${input.collectionId}::uuid AND status = 'active' ORDER BY external_key`;
      const content = contentRows.map((row) => row.content).join("\n\n");
      const versions = await sql<{ version: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS version
        FROM tenancy.knowledge_source_revisions WHERE tenant_id = ${context.tenantId}::uuid AND source_id = ${catalogSourceId}::uuid`;
      const revisionId = randomUUID();
      await sql`INSERT INTO tenancy.knowledge_source_revisions (id, tenant_id, source_id, version, content_text, checksum, provenance_json, created_by_membership_id)
        VALUES (${revisionId}::uuid, ${context.tenantId}::uuid, ${catalogSourceId}::uuid, ${versions[0]!.version},
          ${content}, digest(${content}, 'sha256'), ${sql.json({ kind: "structured_catalog", collectionId: input.collectionId } as never)}, ${context.membershipId}::uuid)`;
      for (const [index, chunk] of contentRows.map((row) => row.content).entries()) await sql`INSERT INTO tenancy.knowledge_chunks
        (tenant_id, source_revision_id, sequence, content_text, content_hash) VALUES (${context.tenantId}::uuid,
          ${revisionId}::uuid, ${index + 1}, ${chunk}, digest(${chunk}, 'sha256'))`;
      return { status: "saved" as const, itemId: rows[0].id, revisionId };
    });
  }

  async listCatalogItems(context: TenantContext, collectionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; itemKind: "product" | "service"; externalKey: string; name: string; description: string;
      priceMinor: number | null; currency: string | null; attributes: Record<string, unknown>; status: string;
    }[]>`SELECT id, item_kind AS "itemKind", external_key AS "externalKey", name, description,
      price_minor::int AS "priceMinor", currency, attributes, status FROM tenancy.knowledge_catalog_items
      WHERE tenant_id = ${context.tenantId}::uuid AND collection_id = ${collectionId}::uuid
      ORDER BY updated_at DESC, id`);
  }
}

const claimSchema = z.object({
  job_id: z.uuid(), tenant_id: z.uuid(), source_id: z.uuid(), object_id: z.uuid().nullable(),
  job_kind: z.enum(["file_extract", "url_crawl", "scheduled_refresh"]), source_url: z.string().nullable(),
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
