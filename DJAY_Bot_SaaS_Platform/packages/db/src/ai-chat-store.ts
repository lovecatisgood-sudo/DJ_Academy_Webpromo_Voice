import { createHash, randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import { aiPlaybookSchema, type AiPlaybook } from "@djay/sales-core";
import { normalizeExactWebsiteOrigin } from "@djay/shared";
import type { TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

type AiAuthority = Readonly<{
  snapshotId: string; subscriptionId: string; planKey: "ai_chat_basic" | "ai_chat_premium";
  accessMode: "none" | "read_only" | "active";
  entitlements: Record<string, boolean | string | number | null>;
  limits: Record<string, number | null>;
}>;

async function aiResourceWritable(sql: postgres.TransactionSql, agentId: string) {
  const rows = await sql<{ writable: boolean }[]>`
    SELECT tenancy.entitlement_resource_is_writable('ai_chat', 'bot', ${agentId}::uuid) AS writable
  `;
  return rows[0]?.writable === true;
}

export class AiChatStore {
  constructor(private readonly client: DatabaseClient) {}

  private async authority(sql: postgres.TransactionSql, tenantId: string): Promise<AiAuthority | null> {
    const rows = await sql<{
      id: string; subscription_id: string; access_mode: AiAuthority["accessMode"];
      resolved_json: { entitlements?: AiAuthority["entitlements"]; limits?: AiAuthority["limits"] };
      plan_key: AiAuthority["planKey"];
    }[]>`
      SELECT snapshot.id, snapshot.subscription_id, snapshot.access_mode, snapshot.resolved_json, plan.plan_key
      FROM tenancy.entitlement_snapshots snapshot
      JOIN tenancy.product_subscriptions subscription
        ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
        AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'ai_chat'
      WHERE snapshot.tenant_id = ${tenantId}::uuid AND snapshot.product_key = 'ai_chat'
      ORDER BY snapshot.created_at DESC, snapshot.id DESC LIMIT 1
    `;
    const row = rows[0];
    return row ? {
      snapshotId: row.id, subscriptionId: row.subscription_id, planKey: row.plan_key,
      accessMode: row.access_mode, entitlements: row.resolved_json.entitlements ?? {},
      limits: row.resolved_json.limits ?? {},
    } : null;
  }

  async authoringCapabilities(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      return authority ? {
        planKey: authority.planKey, accessMode: authority.accessMode,
        web: authority.entitlements["channel.web"] === true,
        social: {
          line: authority.entitlements["channel.line"] === true,
          whatsapp: authority.entitlements["channel.whatsapp"] === true,
          messenger: authority.entitlements["channel.messenger"] === true,
        },
        limits: {
          deployments: authority.limits.deployments ?? null,
          knowledgeDocuments: authority.limits.knowledge_documents ?? null,
        },
      } : null;
    });
  }

  async listAgents(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; status: string; defaultLanguage: "th" | "en";
      currentPublishedPlaybookVersionId: string | null; draftRevision: number | null; deploymentCount: number;
    }[]>`
      SELECT agent.id, agent.name, agent.status, agent.default_language AS "defaultLanguage",
             agent.current_published_playbook_version_id AS "currentPublishedPlaybookVersionId",
             draft.revision AS "draftRevision", count(DISTINCT deployment.id)::int AS "deploymentCount"
      FROM tenancy.ai_agents agent
      LEFT JOIN tenancy.ai_playbook_drafts draft ON draft.tenant_id = agent.tenant_id AND draft.agent_id = agent.id
      LEFT JOIN tenancy.ai_deployments deployment ON deployment.tenant_id = agent.tenant_id
        AND deployment.agent_id = agent.id AND deployment.status = 'active'
      WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.status <> 'archived'
      GROUP BY agent.id, draft.revision ORDER BY agent.updated_at DESC, agent.id
    `);
  }

  async createAgent(context: TenantContext, input: Readonly<{ name: string; businessName: string; defaultLanguage: "th" | "en" }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.text"] !== true
        || authority.entitlements["sales_core.enabled"] !== true) return { status: "not_entitled" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:ai_chat:active_bots`}, 0))`;
      const counts = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.ai_agents
        WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'
          AND id NOT IN (SELECT agent_id FROM tenancy.voice_deployments WHERE tenant_id = ${context.tenantId}::uuid)
      `;
      const activeBotLimit = authority.limits.active_bots;
      if (typeof activeBotLimit === "number" && (counts[0]?.count ?? 0) >= activeBotLimit) {
        return { status: "limit_reached" as const };
      }
      const agentId = randomUUID(); const draftVersionId = randomUUID();
      const definition: AiPlaybook = {
        schemaVersion: 1, playbookVersionId: draftVersionId, agentRole: "sales", businessName: input.businessName,
        agentName: input.name, languages: [input.defaultLanguage], tone: "Warm, concise, and professional",
        salesGoal: "Understand the customer's need and offer an appropriate next step",
        approvedClaims: [], prohibitedClaims: ["Unsupported guarantees", "Unconfirmed availability"],
        discoveryQuestions: ["What are you trying to improve?", "What is the biggest obstacle today?"],
        ctaPolicy: ["Offer a merchant-confirmed consultation when the customer is ready"],
        requiredContactFields: ["name", "email"],
        greeting: { th: "สวัสดีครับ มีอะไรให้ช่วยเกี่ยวกับธุรกิจของคุณได้บ้าง?", en: "Hello. What would you like to improve in your business?" },
        offlineMessage: { th: "ทีมงานจะติดต่อกลับในเวลาทำการ", en: "Our team will follow up during business hours." },
        confidenceThreshold: 0.6,
        publicActions: [],
        timezone: "Asia/Bangkok", weeklyWindows: [1, 2, 3, 4, 5].map((dayOfWeek) => ({ dayOfWeek, startMinute: 540, endMinute: 1020 })),
      };
      await sql`
        INSERT INTO tenancy.ai_agents (id, tenant_id, name, default_language, created_by_membership_id)
        VALUES (${agentId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.defaultLanguage}, ${context.membershipId}::uuid)
      `;
      await sql`
        INSERT INTO tenancy.ai_playbook_drafts (tenant_id, agent_id, definition_json, updated_by_membership_id)
        VALUES (${context.tenantId}::uuid, ${agentId}::uuid, ${sql.json(definition)}, ${context.membershipId}::uuid)
      `;
      return { status: "created" as const, agentId };
    });
  }

  async getDraft(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ revision: number; basedOnVersionId: string | null; definition: unknown; knowledgeRevisionIds: string[]; updatedAt: Date }[]>`
        SELECT revision, based_on_version_id AS "basedOnVersionId", definition_json AS definition,
               knowledge_revision_ids AS "knowledgeRevisionIds", updated_at AS "updatedAt"
        FROM tenancy.ai_playbook_drafts WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid
      `;
      return rows[0] ?? null;
    });
  }

  async updateDraft(context: TenantContext, agentId: string, input: Readonly<{ revision: number; definition: unknown; knowledgeRevisionIds: readonly string[] }>) {
    const definition = aiPlaybookSchema.parse(input.definition);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.text"] !== true) return { status: "not_entitled" as const };
      if (!(await aiResourceWritable(sql, agentId))) return { status: "resource_read_only" as const };
      const revisionIds = [...new Set(input.knowledgeRevisionIds)];
      const available = revisionIds.length ? await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.knowledge_source_revisions
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'ready' AND id = ANY(${revisionIds}::uuid[])
      ` : [{ count: 0 }];
      if (available[0]?.count !== revisionIds.length) return { status: "validation_failed" as const, issues: ["knowledge_revision_not_available"] } as const;
      const knowledgeLimit = authority.limits.knowledge_documents;
      if (typeof knowledgeLimit === "number" && revisionIds.length > knowledgeLimit) return { status: "limit_reached" as const };
      if (definition.notificationProfileId) {
        const profiles = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM tenancy.notification_profiles
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${definition.notificationProfileId}::uuid
            AND status = 'active' AND 'ai_chat.lead_qualified' = ANY(allowed_template_keys)
        `;
        if (profiles[0]?.count !== 1) return { status: "validation_failed" as const, issues: ["notification_profile_not_available"] } as const;
      }
      const rows = await sql<{ revision: number }[]>`
        UPDATE tenancy.ai_playbook_drafts
        SET definition_json = ${sql.json(definition)}, knowledge_revision_ids = ${revisionIds},
            revision = revision + 1, updated_by_membership_id = ${context.membershipId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid AND revision = ${input.revision}
        RETURNING revision
      `;
      return rows[0] ? { status: "updated" as const, revision: rows[0].revision } : { status: "conflict" as const };
    });
  }

  async publish(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.text"] !== true
        || authority.entitlements["knowledge.enabled"] !== true) return { status: "not_entitled" as const };
      if (!(await aiResourceWritable(sql, agentId))) return { status: "resource_read_only" as const };
      const drafts = await sql<{ definition: unknown; knowledgeRevisionIds: string[]; basedOnVersionId: string | null }[]>`
        SELECT definition_json AS definition, knowledge_revision_ids AS "knowledgeRevisionIds", based_on_version_id AS "basedOnVersionId"
        FROM tenancy.ai_playbook_drafts WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid FOR UPDATE
      `;
      if (!drafts[0]) return { status: "not_found" as const };
      const versionRows = await sql<{ version: number }[]>`
        SELECT COALESCE(max(version), 0)::int + 1 AS version FROM tenancy.ai_playbook_versions
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid
      `;
      const version = versionRows[0]!.version; const versionId = randomUUID();
      const playbook = aiPlaybookSchema.parse({ ...(drafts[0].definition as object), playbookVersionId: versionId });
      const serialized = JSON.stringify(playbook);
      await sql`
        INSERT INTO tenancy.ai_playbook_versions (
          id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256, source_version_id, published_by_membership_id
        ) VALUES (
          ${versionId}::uuid, ${context.tenantId}::uuid, ${agentId}::uuid, ${version}, 'published',
          ${sql.json(playbook)}, ${createHash("sha256").update(serialized).digest()}, ${drafts[0].basedOnVersionId}::uuid, ${context.membershipId}::uuid
        )
      `;
      for (const revisionId of drafts[0].knowledgeRevisionIds) await sql`
        INSERT INTO tenancy.ai_playbook_knowledge (tenant_id, agent_id, playbook_version_id, source_revision_id)
        VALUES (${context.tenantId}::uuid, ${agentId}::uuid, ${versionId}::uuid, ${revisionId}::uuid)
      `;
      await sql`
        UPDATE tenancy.ai_agents SET status = 'active', current_published_playbook_version_id = ${versionId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${agentId}::uuid
      `;
      await sql`
        UPDATE tenancy.ai_playbook_drafts SET based_on_version_id = ${versionId}::uuid,
          definition_json = ${sql.json(playbook)}, revision = revision + 1, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid
      `;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'ai_chat.published', 'ai_playbook_version', ${versionId}, ${context.requestId}, 'succeeded', ${sql.json({ agentId, version, planKey: authority.planKey })})`;
      return { status: "published" as const, playbookVersionId: versionId, version };
    });
  }

  async listVersions(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; version: number; sourceVersionId: string | null; publishedAt: Date; knowledgeCount: number;
    }[]>`SELECT version.id, version.version, version.source_version_id AS "sourceVersionId",
      version.published_at AS "publishedAt", count(pin.source_revision_id)::int AS "knowledgeCount"
      FROM tenancy.ai_playbook_versions version
      LEFT JOIN tenancy.ai_playbook_knowledge pin ON pin.tenant_id = version.tenant_id AND pin.playbook_version_id = version.id
      WHERE version.tenant_id = ${context.tenantId}::uuid AND version.agent_id = ${agentId}::uuid
      GROUP BY version.id ORDER BY version.version DESC`);
  }

  async rollback(context: TenantContext, agentId: string, sourceVersionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.text"] !== true
        || authority.entitlements["knowledge.enabled"] !== true) return { status: "not_entitled" as const };
      if (!(await aiResourceWritable(sql, agentId))) return { status: "resource_read_only" as const };
      const sources = await sql<{ playbook: unknown; knowledgeRevisionIds: string[] }[]>`SELECT version.playbook_json AS playbook,
        COALESCE(array_agg(pin.source_revision_id ORDER BY pin.source_revision_id) FILTER (WHERE pin.source_revision_id IS NOT NULL), '{}')::uuid[] AS "knowledgeRevisionIds"
        FROM tenancy.ai_playbook_versions version
        LEFT JOIN tenancy.ai_playbook_knowledge pin ON pin.tenant_id = version.tenant_id AND pin.playbook_version_id = version.id
        WHERE version.tenant_id = ${context.tenantId}::uuid AND version.agent_id = ${agentId}::uuid AND version.id = ${sourceVersionId}::uuid
        GROUP BY version.id`;
      if (!sources[0]) return { status: "not_found" as const };
      const knowledgeLimit = authority.limits.knowledge_documents;
      if (typeof knowledgeLimit === "number" && sources[0].knowledgeRevisionIds.length > knowledgeLimit) return { status: "limit_reached" as const };
      const versionId = randomUUID();
      const playbook = aiPlaybookSchema.parse({ ...(sources[0].playbook as object), playbookVersionId: versionId });
      const versionRows = await sql<{ version: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS version
        FROM tenancy.ai_playbook_versions WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid`;
      const version = versionRows[0]!.version;
      await sql`INSERT INTO tenancy.ai_playbook_versions
        (id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256, source_version_id, published_by_membership_id)
        VALUES (${versionId}::uuid, ${context.tenantId}::uuid, ${agentId}::uuid, ${version}, 'published', ${sql.json(playbook)},
          ${createHash("sha256").update(JSON.stringify(playbook)).digest()}, ${sourceVersionId}::uuid, ${context.membershipId}::uuid)`;
      for (const revisionId of sources[0].knowledgeRevisionIds) await sql`INSERT INTO tenancy.ai_playbook_knowledge
        (tenant_id, agent_id, playbook_version_id, source_revision_id) VALUES
        (${context.tenantId}::uuid, ${agentId}::uuid, ${versionId}::uuid, ${revisionId}::uuid)`;
      await sql`UPDATE tenancy.ai_agents SET status = 'active', current_published_playbook_version_id = ${versionId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${agentId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'ai_chat.rollback_published', 'ai_playbook_version', ${versionId}, ${context.requestId}, 'succeeded', ${sql.json({ agentId, version, sourceVersionId, planKey: authority.planKey })})`;
      return { status: "published" as const, playbookVersionId: versionId, version };
    });
  }

  async createWebDeployment(context: TenantContext, agentId: string, input: Readonly<{ name: string; allowedOrigins: readonly string[] }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["channel.web"] !== true) return { status: "not_entitled" as const };
      if (!(await aiResourceWritable(sql, agentId))) return { status: "resource_read_only" as const };
      const origins = [...new Set(input.allowedOrigins.map(normalizeExactWebsiteOrigin))];
      if (!origins.length || origins.some((value) => value === null)) return { status: "validation_failed" as const };
      const agents = await sql<{ published: boolean }[]>`
        SELECT current_published_playbook_version_id IS NOT NULL AS published FROM tenancy.ai_agents
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${agentId}::uuid AND status = 'active'
      `;
      if (!agents[0]?.published) return { status: "not_found" as const };
      const counts = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.ai_deployments WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'
      `;
      const limit = authority.limits.deployments;
      if (typeof limit === "number" && (counts[0]?.count ?? 0) >= limit) return { status: "limit_reached" as const };
      const deploymentId = randomUUID(); const deploymentKey = `djay_ai_${createOpaqueToken()}`;
      await sql`
        INSERT INTO tenancy.ai_deployments (
          id, tenant_id, agent_id, name, channel, deployment_key_hash, key_prefix, allowed_origins, created_by_membership_id
        ) VALUES (
          ${deploymentId}::uuid, ${context.tenantId}::uuid, ${agentId}::uuid, ${input.name}, 'web',
          ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 16)}, ${origins as string[]}, ${context.membershipId}::uuid
        )
      `;
      return { status: "created" as const, deploymentId, deploymentKey };
    });
  }

  async listDeployments(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; channel: "web" | "line" | "whatsapp" | "messenger";
      keyPrefix: string | null; allowedOrigins: string[]; status: "active" | "disabled" | "revoked";
      createdAt: Date; rotatedAt: Date | null;
    }[]>`
      SELECT id, name, channel, key_prefix AS "keyPrefix", allowed_origins AS "allowedOrigins",
             status, created_at AS "createdAt", rotated_at AS "rotatedAt"
      FROM tenancy.ai_deployments
      WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid
      ORDER BY created_at DESC, id DESC
    `);
  }

  async getTestContext(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.text"] !== true) return null;
      const drafts = await sql<{ playbook: unknown; knowledgeRevisionIds: string[]; publishedVersionId: string | null }[]>`
        SELECT draft.definition_json AS playbook, draft.knowledge_revision_ids AS "knowledgeRevisionIds",
          CASE WHEN draft.based_on_version_id = agent.current_published_playbook_version_id
            AND draft.definition_json = version.playbook_json THEN version.id END AS "publishedVersionId"
        FROM tenancy.ai_playbook_drafts draft
        JOIN tenancy.ai_agents agent ON agent.tenant_id = draft.tenant_id AND agent.id = draft.agent_id
        LEFT JOIN tenancy.ai_playbook_versions version ON version.tenant_id = agent.tenant_id
          AND version.agent_id = agent.id AND version.id = agent.current_published_playbook_version_id
        WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.agent_id = ${agentId}::uuid
      `;
      const draft = drafts[0];
      if (!draft) return null;
      const chunks = draft.knowledgeRevisionIds.length ? await sql<{
        sourceRevisionId: string; chunkId: string; content: string;
      }[]>`
        SELECT source_revision_id AS "sourceRevisionId", id AS "chunkId", content_text AS content
        FROM tenancy.knowledge_chunks
        WHERE tenant_id = ${context.tenantId}::uuid
          AND source_revision_id = ANY(${draft.knowledgeRevisionIds}::uuid[])
        ORDER BY source_revision_id, sequence
      ` : [];
      return { playbook: draft.playbook, knowledgeChunks: chunks, publishedVersionId: draft.publishedVersionId };
    });
  }

  async analytics(context: TenantContext, periodDays = 30) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority) return null;
      const rows = await sql<{
        sessions: number; completedTurns: number; failedTurns: number; handovers: number;
        leads: number; appointmentRequests: number; settledResponses: number;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM tenancy.ai_sessions session
           WHERE session.tenant_id = ${context.tenantId}::uuid AND session.started_at >= now() - make_interval(days => ${periodDays})) AS sessions,
          (SELECT count(*)::int FROM tenancy.ai_turns turn
           WHERE turn.tenant_id = ${context.tenantId}::uuid AND turn.status = 'completed' AND turn.started_at >= now() - make_interval(days => ${periodDays})) AS "completedTurns",
          (SELECT count(*)::int FROM tenancy.ai_turns turn
           WHERE turn.tenant_id = ${context.tenantId}::uuid AND turn.status = 'failed' AND turn.started_at >= now() - make_interval(days => ${periodDays})) AS "failedTurns",
          (SELECT count(*)::int FROM tenancy.handover_events event
           JOIN tenancy.conversations conversation ON conversation.tenant_id = event.tenant_id AND conversation.id = event.conversation_id
           WHERE event.tenant_id = ${context.tenantId}::uuid AND conversation.product_key = 'ai_chat'
             AND event.event_type IN ('requested', 'accepted') AND event.created_at >= now() - make_interval(days => ${periodDays})) AS handovers,
          (SELECT count(*)::int FROM tenancy.leads lead
           WHERE lead.tenant_id = ${context.tenantId}::uuid
             AND lead.source IN ('ai_chat_web', 'ai_chat_line', 'ai_chat_whatsapp', 'ai_chat_messenger')
             AND lead.created_at >= now() - make_interval(days => ${periodDays})) AS leads,
          (SELECT count(*)::int FROM tenancy.appointment_requests request
           JOIN tenancy.conversations conversation ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
           WHERE request.tenant_id = ${context.tenantId}::uuid AND conversation.product_key = 'ai_chat'
             AND request.created_at >= now() - make_interval(days => ${periodDays})) AS "appointmentRequests",
          (SELECT COALESCE(sum(event.customer_quantity), 0)::int FROM tenancy.usage_events event
           WHERE event.tenant_id = ${context.tenantId}::uuid AND event.product_key = 'ai_chat'
             AND event.event_type = 'settled' AND event.occurred_at >= now() - make_interval(days => ${periodDays})) AS "settledResponses"
      `;
      const channels = await sql<{
        channel: "web" | "line" | "whatsapp" | "messenger";
        sessions: number; completedTurns: number; failedTurns: number;
        leads: number; appointmentRequests: number; delivered: number;
        pendingDeliveries: number; failedDeliveries: number; attemptedQuantity: number;
      }[]>`
        SELECT scope.channel,
          (SELECT count(*)::int FROM tenancy.ai_sessions session
           JOIN tenancy.ai_deployments deployment
             ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
           WHERE session.tenant_id = ${context.tenantId}::uuid AND deployment.channel = scope.channel
             AND session.started_at >= now() - make_interval(days => ${periodDays})) AS sessions,
          (SELECT count(*)::int FROM tenancy.ai_turns turn
           JOIN tenancy.ai_sessions session
             ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
           JOIN tenancy.ai_deployments deployment
             ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
           WHERE turn.tenant_id = ${context.tenantId}::uuid AND deployment.channel = scope.channel
             AND turn.status = 'completed'
             AND turn.started_at >= now() - make_interval(days => ${periodDays})) AS "completedTurns",
          (SELECT count(*)::int FROM tenancy.ai_turns turn
           JOIN tenancy.ai_sessions session
             ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
           JOIN tenancy.ai_deployments deployment
             ON deployment.tenant_id = session.tenant_id AND deployment.id = session.deployment_id
           WHERE turn.tenant_id = ${context.tenantId}::uuid AND deployment.channel = scope.channel
             AND turn.status = 'failed'
             AND turn.started_at >= now() - make_interval(days => ${periodDays})) AS "failedTurns",
          (SELECT count(*)::int FROM tenancy.leads lead
           WHERE lead.tenant_id = ${context.tenantId}::uuid
             AND lead.source = 'ai_chat_' || scope.channel
             AND lead.created_at >= now() - make_interval(days => ${periodDays})) AS leads,
          (SELECT count(*)::int FROM tenancy.appointment_requests request
           JOIN tenancy.conversations conversation
             ON conversation.tenant_id = request.tenant_id AND conversation.id = request.conversation_id
           WHERE request.tenant_id = ${context.tenantId}::uuid
             AND conversation.product_key = 'ai_chat' AND conversation.channel_kind = scope.channel
             AND request.created_at >= now() - make_interval(days => ${periodDays})) AS "appointmentRequests",
          (SELECT count(*) FILTER (WHERE delivery.status = 'succeeded')::int
           FROM tenancy.ai_social_outbound_deliveries delivery
           WHERE delivery.tenant_id = ${context.tenantId}::uuid AND delivery.channel = scope.channel
             AND delivery.created_at >= now() - make_interval(days => ${periodDays})) AS delivered,
          (SELECT count(*) FILTER (WHERE delivery.status IN ('pending', 'processing'))::int
           FROM tenancy.ai_social_outbound_deliveries delivery
           WHERE delivery.tenant_id = ${context.tenantId}::uuid AND delivery.channel = scope.channel
             AND delivery.created_at >= now() - make_interval(days => ${periodDays})) AS "pendingDeliveries",
          (SELECT count(*) FILTER (WHERE delivery.status IN ('failed', 'dead_letter'))::int
           FROM tenancy.ai_social_outbound_deliveries delivery
           WHERE delivery.tenant_id = ${context.tenantId}::uuid AND delivery.channel = scope.channel
             AND delivery.created_at >= now() - make_interval(days => ${periodDays})) AS "failedDeliveries",
          (SELECT COALESCE(sum(event.attempted_quantity), 0)::int
           FROM tenancy.ai_social_channel_quantity_events event
           WHERE event.tenant_id = ${context.tenantId}::uuid AND event.channel = scope.channel
             AND event.occurred_at >= now() - make_interval(days => ${periodDays})) AS "attemptedQuantity"
        FROM (VALUES ('web'::text), ('line'::text), ('whatsapp'::text), ('messenger'::text)) scope(channel)
      `;
      const advanced = authority.entitlements["analytics.level"] === "advanced";
      const questions = advanced ? await sql<{ question: string; occurrences: number }[]>`
        SELECT left(lower(btrim(message.content_json->'content'->>'text')), 500) AS question, count(*)::int AS occurrences
        FROM tenancy.messages message JOIN tenancy.conversations conversation ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
        WHERE message.tenant_id = ${context.tenantId}::uuid AND conversation.product_key = 'ai_chat' AND message.actor_type = 'customer'
          AND message.created_at >= now() - make_interval(days => ${periodDays}) AND nullif(btrim(message.content_json->'content'->>'text'), '') IS NOT NULL
        GROUP BY left(lower(btrim(message.content_json->'content'->>'text')), 500) ORDER BY occurrences DESC, question LIMIT 20` : [];
      const intents = advanced ? await sql<{ intent: string; occurrences: number }[]>`
        SELECT turn.structured_output_json->>'intent' AS intent, count(*)::int AS occurrences FROM tenancy.ai_turns turn
        WHERE turn.tenant_id = ${context.tenantId}::uuid AND turn.status = 'completed'
          AND turn.started_at >= now() - make_interval(days => ${periodDays})
        GROUP BY turn.structured_output_json->>'intent' ORDER BY occurrences DESC, intent LIMIT 20` : [];
      const segments = advanced ? await sql<{ segment: string; customers: number }[]>`
        SELECT segment, count(*)::int AS customers FROM tenancy.ai_contact_insights WHERE tenant_id = ${context.tenantId}::uuid
        GROUP BY segment ORDER BY CASE segment WHEN 'hot' THEN 1 WHEN 'warm' THEN 2 WHEN 'engaged' THEN 3 ELSE 4 END` : [];
      const unanswered = advanced ? await sql<{ unanswered: number }[]>`
        SELECT COALESCE(sum(unanswered_count), 0)::int AS unanswered FROM tenancy.ai_conversation_insights
        WHERE tenant_id = ${context.tenantId}::uuid AND updated_at >= now() - make_interval(days => ${periodDays})` : [{ unanswered: 0 }];
      return {
        periodDays, level: authority.entitlements["analytics.level"] ?? "core",
        ...rows[0]!, channels, questions, intents, segments, unanswered: unanswered[0]?.unanswered ?? 0,
      };
    });
  }
}
