import { createHash, randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import { aiPlaybookSchema, type AiPlaybook } from "@djay/sales-core";
import { normalizeExactWebsiteOrigin } from "@djay/shared";
import type { TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

type VoiceCapabilityProfile = "voice_gen1" | "voice_gen2";
type VoicePublicLabel = "First-Generation Voice Engine" | "Second-Generation Voice Engine";

export type VoiceAnalytics = Readonly<{
  periodDays: number;
  level: "core" | "advanced";
  deploymentId: string | null;
  summary: Readonly<{
    sessions: number; connectedCalls: number; completedCalls: number; failedCalls: number;
    completedTurns: number; failedTurns: number; leads: number; appointmentRequests: number;
    callbackRequests: number; settledMinutes: number; reconnectingCalls: number;
    averageConnectedSeconds: number | null; averageTurnMilliseconds: number | null;
    p95TurnMilliseconds: number | null;
  }>;
  outcomes: readonly Readonly<{ outcome: string; calls: number }>[];
  languages: readonly Readonly<{ locale: "th" | "en"; calls: number }>[];
  terminalReasons: readonly Readonly<{ reason: string; calls: number }>[];
  turnFailures: readonly Readonly<{ errorCode: string; turns: number }>[];
  daily: readonly Readonly<{
    date: string; sessions: number; completedCalls: number; failedCalls: number; leads: number;
  }>[];
}>;

function publicLabel(profile: VoiceCapabilityProfile): VoicePublicLabel {
  return profile === "voice_gen1" ? "First-Generation Voice Engine" : "Second-Generation Voice Engine";
}

async function voiceResourceWritable(sql: postgres.TransactionSql, deploymentId: string) {
  const rows = await sql<{ writable: boolean }[]>`
    SELECT tenancy.entitlement_resource_is_writable('voice', 'deployment', ${deploymentId}::uuid) AS writable
  `;
  return rows[0]?.writable === true;
}

async function voiceAuthority(sql: postgres.TransactionSql, tenantId: string) {
  const rows = await sql<{
    snapshotId: string; subscriptionId: string; accessMode: "none" | "read_only" | "active";
    capabilityProfile: VoiceCapabilityProfile; planKey: "voice_basic_gen1" | "voice_advanced_gen2";
    entitlements: Record<string, boolean | string | number | null>;
    allowances: Record<string, number | null>; limits: Record<string, number | null>;
  }[]>`
    SELECT snapshot.id AS "snapshotId", snapshot.subscription_id AS "subscriptionId",
           snapshot.access_mode AS "accessMode", plan.plan_key AS "planKey",
           snapshot.resolved_json->'entitlements'->>'voice.capability_profile' AS "capabilityProfile",
           COALESCE(snapshot.resolved_json->'entitlements', '{}'::jsonb) AS entitlements,
           COALESCE(snapshot.resolved_json->'allowances', '{}'::jsonb) AS allowances,
           COALESCE(snapshot.resolved_json->'limits', '{}'::jsonb) AS limits
    FROM tenancy.entitlement_snapshots snapshot
    JOIN tenancy.product_subscriptions subscription
      ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
      AND subscription.status IN ('active', 'trialing', 'scheduled_change')
    JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
    JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'voice'
    WHERE snapshot.id = (
      SELECT candidate.id FROM tenancy.entitlement_snapshots candidate
      JOIN tenancy.product_subscriptions current_subscription
        ON current_subscription.tenant_id = candidate.tenant_id
        AND current_subscription.id = candidate.subscription_id
        AND current_subscription.status IN ('active', 'trialing', 'scheduled_change')
      WHERE candidate.tenant_id = ${tenantId}::uuid AND candidate.product_key = 'voice'
      ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
    ) AND snapshot.access_mode = 'active'
      AND snapshot.resolved_json->'entitlements'->>'voice.enabled' = 'true'
      AND ((plan.plan_key = 'voice_basic_gen1'
          AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen1')
        OR (plan.plan_key = 'voice_advanced_gen2'
          AND snapshot.resolved_json->'entitlements'->>'voice.capability_profile' = 'voice_gen2'))
    LIMIT 1
  `;
  return rows[0] ?? null;
}

async function hasVoiceAuthority(
  sql: postgres.TransactionSql,
  tenantId: string,
  capabilityProfile?: VoiceCapabilityProfile,
) {
  const authority = await voiceAuthority(sql, tenantId);
  return authority?.accessMode === "active"
    && authority.entitlements["voice.enabled"] === true
    && (!capabilityProfile || authority.capabilityProfile === capabilityProfile)
    ? authority : null;
}

export class VoiceDeploymentStore {
  constructor(private readonly client: DatabaseClient) {}

  async listConfigurations(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await voiceAuthority(sql, context.tenantId);
      return {
        capability: authority
          ? { enabled: true as const, publicLabel: publicLabel(authority.capabilityProfile) }
          : null,
        configurations: await sql<{
          id: string; name: string; status: "draft" | "active" | "archived";
          defaultLanguage: "th" | "en"; currentPublishedPlaybookVersionId: string | null;
          currentPublishedVersion: number | null; draftRevision: number; deploymentCount: number;
          updatedAt: Date;
        }[]>`
          SELECT agent.id, agent.name, agent.status, agent.default_language AS "defaultLanguage",
                 agent.current_published_playbook_version_id AS "currentPublishedPlaybookVersionId",
                 published.version AS "currentPublishedVersion", draft.revision AS "draftRevision",
                 count(DISTINCT deployment.id)::int AS "deploymentCount", agent.updated_at AS "updatedAt"
          FROM tenancy.ai_agents agent
          JOIN tenancy.ai_playbook_drafts draft
            ON draft.tenant_id = agent.tenant_id AND draft.agent_id = agent.id
          LEFT JOIN tenancy.ai_playbook_versions published
            ON published.tenant_id = agent.tenant_id
            AND published.id = agent.current_published_playbook_version_id
          LEFT JOIN tenancy.voice_deployments deployment
            ON deployment.tenant_id = agent.tenant_id AND deployment.agent_id = agent.id
            AND deployment.status <> 'revoked'
          WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.product_family = 'voice'
            AND agent.status <> 'archived'
          GROUP BY agent.id, published.version, draft.revision
          ORDER BY agent.updated_at DESC, agent.id
        `,
      };
    });
  }

  async getConfigurationDraft(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; name: string; defaultLanguage: "th" | "en"; status: string;
        currentPublishedPlaybookVersionId: string | null; currentPublishedVersion: number | null;
        revision: number; basedOnVersionId: string | null; definition: unknown;
        knowledgeRevisionIds: string[]; deploymentCount: number; updatedAt: Date;
      }[]>`
        SELECT agent.id, agent.name, agent.default_language AS "defaultLanguage", agent.status,
               agent.current_published_playbook_version_id AS "currentPublishedPlaybookVersionId",
               published.version AS "currentPublishedVersion", draft.revision,
               draft.based_on_version_id AS "basedOnVersionId", draft.definition_json AS definition,
               draft.knowledge_revision_ids AS "knowledgeRevisionIds",
               (SELECT count(*)::int FROM tenancy.voice_deployments deployment
                WHERE deployment.tenant_id = agent.tenant_id AND deployment.agent_id = agent.id
                  AND deployment.status <> 'revoked') AS "deploymentCount",
               draft.updated_at AS "updatedAt"
        FROM tenancy.ai_agents agent
        JOIN tenancy.ai_playbook_drafts draft
          ON draft.tenant_id = agent.tenant_id AND draft.agent_id = agent.id
        LEFT JOIN tenancy.ai_playbook_versions published
          ON published.tenant_id = agent.tenant_id
          AND published.id = agent.current_published_playbook_version_id
        WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.id = ${agentId}::uuid
          AND agent.product_family = 'voice' AND agent.status <> 'archived'
      `;
      if (!rows[0]) return null;
      return { ...rows[0], editable: Boolean(await hasVoiceAuthority(sql, context.tenantId)) };
    });
  }

  async updateConfigurationDraft(context: TenantContext, agentId: string, input: Readonly<{
    revision: number; definition: unknown; knowledgeRevisionIds: readonly string[];
  }>) {
    const definition = aiPlaybookSchema.parse(input.definition);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await hasVoiceAuthority(sql, context.tenantId))) return { status: "not_entitled" as const };
      const agents = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.ai_agents
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${agentId}::uuid
          AND product_family = 'voice' AND status <> 'archived' FOR UPDATE
      `;
      if (!agents[0]) return { status: "not_found" as const };
      const revisionIds = [...new Set(input.knowledgeRevisionIds)];
      const available = revisionIds.length ? await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.knowledge_source_revisions
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'ready'
          AND id = ANY(${revisionIds}::uuid[])
      ` : [{ count: 0 }];
      if (available[0]?.count !== revisionIds.length) return { status: "validation_failed" as const };
      const updated = await sql<{ revision: number }[]>`
        UPDATE tenancy.ai_playbook_drafts SET definition_json = ${sql.json(definition)},
          knowledge_revision_ids = ${revisionIds}, revision = revision + 1,
          updated_by_membership_id = ${context.membershipId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid
          AND revision = ${input.revision}
        RETURNING revision
      `;
      if (!updated[0]) return { status: "conflict" as const };
      await sql`UPDATE tenancy.ai_agents
        SET name = ${definition.agentName}, default_language = ${definition.languages[0] ?? "th"}, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${agentId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (
        tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
        request_id, result, metadata
      ) VALUES (
        ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
        'voice.configuration.saved', 'ai_agent', ${agentId}, ${context.requestId}, 'succeeded',
        ${sql.json({ revision: updated[0].revision, knowledgeRevisionCount: revisionIds.length })}
      )`;
      return { status: "updated" as const, revision: updated[0].revision };
    });
  }

  async publishConfiguration(context: TenantContext, agentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (!(await hasVoiceAuthority(sql, context.tenantId))) return { status: "not_entitled" as const };
      const rows = await sql<{ definition: unknown; knowledgeRevisionIds: string[] }[]>`
        SELECT draft.definition_json AS definition, draft.knowledge_revision_ids AS "knowledgeRevisionIds"
        FROM tenancy.ai_agents agent
        JOIN tenancy.ai_playbook_drafts draft
          ON draft.tenant_id = agent.tenant_id AND draft.agent_id = agent.id
        WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.id = ${agentId}::uuid
          AND agent.product_family = 'voice' AND agent.status <> 'archived'
        FOR UPDATE OF agent, draft
      `;
      const row = rows[0];
      if (!row) return { status: "not_found" as const };
      const available = row.knowledgeRevisionIds.length ? await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.knowledge_source_revisions
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'ready'
          AND id = ANY(${row.knowledgeRevisionIds}::uuid[])
      ` : [{ count: 0 }];
      if (available[0]?.count !== row.knowledgeRevisionIds.length) {
        return { status: "validation_failed" as const };
      }
      const versions = await sql<{ version: number }[]>`
        SELECT COALESCE(max(version), 0)::int + 1 AS version FROM tenancy.ai_playbook_versions
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid
      `;
      const version = versions[0]!.version;
      const versionId = randomUUID();
      const playbook = aiPlaybookSchema.parse({ ...(row.definition as object), playbookVersionId: versionId });
      await sql`INSERT INTO tenancy.ai_playbook_versions (
        id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256,
        published_by_membership_id
      ) VALUES (
        ${versionId}::uuid, ${context.tenantId}::uuid, ${agentId}::uuid, ${version}, 'published',
        ${sql.json(playbook)}, ${createHash("sha256").update(JSON.stringify(playbook)).digest()},
        ${context.membershipId}::uuid
      )`;
      for (const revisionId of row.knowledgeRevisionIds) await sql`
        INSERT INTO tenancy.ai_playbook_knowledge (tenant_id, agent_id, playbook_version_id, source_revision_id)
        VALUES (${context.tenantId}::uuid, ${agentId}::uuid, ${versionId}::uuid, ${revisionId}::uuid)
      `;
      await sql`UPDATE tenancy.ai_agents SET status = 'active',
        current_published_playbook_version_id = ${versionId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${agentId}::uuid`;
      await sql`UPDATE tenancy.ai_playbook_drafts SET based_on_version_id = ${versionId}::uuid,
        definition_json = ${sql.json(playbook)}, revision = revision + 1, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${agentId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (
        tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id,
        request_id, result, metadata
      ) VALUES (
        ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
        'voice.configuration.published', 'ai_agent', ${agentId}, ${context.requestId}, 'succeeded',
        ${sql.json({ playbookVersionId: versionId, version, deploymentCreated: false })}
      )`;
      return { status: "published" as const, playbookVersionId: versionId, version };
    });
  }

  async list(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await hasVoiceAuthority(sql, context.tenantId);
      return {
        capability: authority
          ? { enabled: true as const, publicLabel: publicLabel(authority.capabilityProfile) }
          : null,
        deployments: await sql<{
          id: string; name: string; keyPrefix: string; allowedOrigins: string[];
          defaultLocale: "th" | "en"; maxCallSeconds: number; reconnectWindowSeconds: number;
          status: "active" | "disabled" | "revoked"; agentName: string; businessName: string;
          trafficStatus: "inactive" | "live"; livePlaybookVersionId: string | null; liveAt: Date | null;
          publicLabel: VoicePublicLabel; createdAt: Date; updatedAt: Date;
        }[]>`
          SELECT deployment.id, deployment.name, deployment.key_prefix AS "keyPrefix",
                 deployment.allowed_origins AS "allowedOrigins",
                 deployment.default_locale AS "defaultLocale", deployment.max_call_seconds AS "maxCallSeconds",
                 reconnect_window_seconds AS "reconnectWindowSeconds", deployment.status,
                 deployment.traffic_status AS "trafficStatus",
                 deployment.live_playbook_version_id AS "livePlaybookVersionId", deployment.live_at AS "liveAt",
                 agent.name AS "agentName", playbook.playbook_json->>'businessName' AS "businessName",
                 CASE deployment.capability_profile WHEN 'voice_gen1' THEN 'First-Generation Voice Engine'
                   ELSE 'Second-Generation Voice Engine' END AS "publicLabel",
                 deployment.created_at AS "createdAt", deployment.updated_at AS "updatedAt"
          FROM tenancy.voice_deployments deployment
          JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
          JOIN tenancy.ai_playbook_versions playbook ON playbook.tenant_id = agent.tenant_id
            AND playbook.id = agent.current_published_playbook_version_id
          WHERE deployment.tenant_id = ${context.tenantId}::uuid
          ORDER BY deployment.created_at DESC, deployment.id DESC
        `,
      };
    });
  }

  async getStudio(context: TenantContext, deploymentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; name: string; keyPrefix: string; allowedOrigins: string[];
        defaultLocale: "th" | "en"; greetingTh: string; greetingEn: string;
        automatedDisclosureTh: string; automatedDisclosureEn: string;
        maxCallSeconds: number; reconnectWindowSeconds: number;
        status: "active" | "disabled" | "revoked"; trafficStatus: "inactive" | "live";
        livePlaybookVersionId: string | null; liveAt: Date | null; agentId: string; agentName: string;
        capabilityProfile: VoiceCapabilityProfile;
        currentPublishedPlaybookVersionId: string | null; currentPublishedVersion: number | null;
        draftRevision: number; definition: unknown; knowledgeRevisionIds: string[]; draftUpdatedAt: Date;
      }[]>`
        SELECT deployment.id, deployment.name, deployment.key_prefix AS "keyPrefix",
               deployment.allowed_origins AS "allowedOrigins", deployment.default_locale AS "defaultLocale",
               deployment.greeting_th AS "greetingTh", deployment.greeting_en AS "greetingEn",
               deployment.automated_disclosure_th AS "automatedDisclosureTh",
               deployment.automated_disclosure_en AS "automatedDisclosureEn",
               deployment.max_call_seconds AS "maxCallSeconds",
               deployment.reconnect_window_seconds AS "reconnectWindowSeconds", deployment.status,
               deployment.traffic_status AS "trafficStatus",
               deployment.live_playbook_version_id AS "livePlaybookVersionId", deployment.live_at AS "liveAt",
               deployment.capability_profile AS "capabilityProfile",
               agent.id AS "agentId", agent.name AS "agentName",
               agent.current_published_playbook_version_id AS "currentPublishedPlaybookVersionId",
               published.version AS "currentPublishedVersion", draft.revision AS "draftRevision",
               draft.definition_json AS definition, draft.knowledge_revision_ids AS "knowledgeRevisionIds",
               draft.updated_at AS "draftUpdatedAt"
        FROM tenancy.voice_deployments deployment
        JOIN tenancy.ai_agents agent
          ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        JOIN tenancy.ai_playbook_drafts draft
          ON draft.tenant_id = agent.tenant_id AND draft.agent_id = agent.id
        LEFT JOIN tenancy.ai_playbook_versions published
          ON published.tenant_id = agent.tenant_id
          AND published.id = agent.current_published_playbook_version_id
        WHERE deployment.tenant_id = ${context.tenantId}::uuid AND deployment.id = ${deploymentId}::uuid
      `;
      const deploymentRecord = rows[0];
      if (!deploymentRecord) return null;
      const { capabilityProfile, ...deployment } = deploymentRecord;
      const authority = await voiceAuthority(sql, context.tenantId);
      const authorityMatches = authority?.capabilityProfile === capabilityProfile;
      const availabilityRows = await sql<{ available: boolean }[]>`
        SELECT tenancy.voice_profile_available(${capabilityProfile}) AS available
      `;
      const profileAvailable = availabilityRows[0]?.available ?? false;
      const quotaRows = await sql<{
        includedMinutes: number | null; usedMinutes: number; reservedMinutes: number;
        periodStart: Date; periodEnd: Date;
      }[]>`
        SELECT account.included_quantity::float8 AS "includedMinutes",
               account.settled_quantity::float8 AS "usedMinutes",
               account.reserved_quantity::float8 AS "reservedMinutes",
               account.period_start AS "periodStart", account.period_end AS "periodEnd"
        FROM tenancy.quota_accounts account
        JOIN tenancy.product_subscriptions subscription
          ON subscription.tenant_id = account.tenant_id AND subscription.id = account.subscription_id
          AND subscription.product_key = 'voice'
        WHERE account.tenant_id = ${context.tenantId}::uuid AND account.customer_unit = 'voice_minute'
        ORDER BY account.period_start DESC, account.id DESC LIMIT 1
      `;
      const activeRows = await sql<{ activeCalls: number }[]>`
        SELECT count(*)::int AS "activeCalls" FROM tenancy.voice_concurrency_leases lease
        WHERE lease.tenant_id = ${context.tenantId}::uuid AND lease.released_at IS NULL
      `;
      const qualityRows = await sql<{
        totalCalls: number; completedCalls: number; failedCalls: number; transcriptTurns: number;
        averageConnectedSeconds: number | null; lastCallAt: Date | null;
      }[]>`
        SELECT
          count(*)::int AS "totalCalls",
          count(*) FILTER (WHERE session.status = 'ended')::int AS "completedCalls",
          count(*) FILTER (WHERE session.status IN ('failed', 'expired'))::int AS "failedCalls",
          (SELECT count(*)::int FROM tenancy.voice_turns turn
           JOIN tenancy.voice_sessions turn_session
             ON turn_session.tenant_id = turn.tenant_id AND turn_session.id = turn.session_id
           WHERE turn.tenant_id = ${context.tenantId}::uuid AND turn.status = 'completed'
             AND turn_session.deployment_id = ${deploymentId}::uuid
             AND turn.started_at >= now() - interval '30 days') AS "transcriptTurns",
          (avg(EXTRACT(EPOCH FROM (session.ended_at - session.connected_at)))
            FILTER (WHERE session.connected_at IS NOT NULL AND session.ended_at IS NOT NULL))::float8
            AS "averageConnectedSeconds",
          max(session.created_at) AS "lastCallAt"
        FROM tenancy.voice_sessions session
        WHERE session.tenant_id = ${context.tenantId}::uuid
          AND session.deployment_id = ${deploymentId}::uuid
          AND session.created_at >= now() - interval '30 days'
      `;
      const quota = quotaRows[0] ?? {
        includedMinutes: authority?.allowances.voice_minute ?? null, usedMinutes: 0, reservedMinutes: 0,
        periodStart: null, periodEnd: null,
      };
      const health = deployment.status === "revoked" ? "revoked"
        : deployment.status === "disabled" ? "disabled"
          : !deployment.currentPublishedPlaybookVersionId ? "setup_required"
            : capabilityProfile === "voice_gen2" && !profileAvailable ? "route_unavailable"
              : "ready";
      return {
        deployment, publicLabel: publicLabel(capabilityProfile), health,
        editable: authority?.accessMode === "active"
          && authorityMatches
          && authority.entitlements["voice.enabled"] === true
          && authority.entitlements["voice.capability_profile"] === capabilityProfile,
        runtimeAvailability: profileAvailable ? "available" as const : "unavailable" as const,
        usage: {
          ...quota, activeCalls: activeRows[0]?.activeCalls ?? 0,
          concurrencyLimit: authority?.limits.concurrent_calls ?? null,
        },
        actions: {
          leadCapture: authority?.entitlements["lead_capture.enabled"] === true,
          appointmentRequest: authority?.entitlements["appointment_request.enabled"] === true,
          merchantEmail: authority?.entitlements["sales_email_action.enabled"] === true,
          humanHandover: authority?.entitlements["human_handover.enabled"] === true,
        },
        quality: qualityRows[0] ?? {
          totalCalls: 0, completedCalls: 0, failedCalls: 0, transcriptTurns: 0,
          averageConnectedSeconds: null, lastCallAt: null,
        },
      };
    });
  }

  async analytics(
    context: TenantContext,
    input: Readonly<{ deploymentId?: string; periodDays?: number }> = {},
  ): Promise<VoiceAnalytics | null> {
    const periodDays = Number.isInteger(input.periodDays)
      ? Math.min(365, Math.max(1, input.periodDays!)) : 30;
    const deploymentId = input.deploymentId ?? null;
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await hasVoiceAuthority(sql, context.tenantId);
      if (!authority) return null;
      if (deploymentId) {
        const deployment = await sql<{ exists: boolean }[]>`
          SELECT EXISTS(
            SELECT 1 FROM tenancy.voice_deployments
            WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid
          ) AS exists
        `;
        if (!deployment[0]?.exists) return null;
      }
      const summaryRows = await sql<VoiceAnalytics["summary"][]>`
        WITH scoped_sessions AS MATERIALIZED (
          SELECT session.* FROM tenancy.voice_sessions session
          WHERE session.tenant_id = ${context.tenantId}::uuid
            AND session.created_at >= now() - make_interval(days => ${periodDays})
            AND (${deploymentId}::uuid IS NULL OR session.deployment_id = ${deploymentId}::uuid)
        )
        SELECT
          (SELECT count(*)::int FROM scoped_sessions) AS sessions,
          (SELECT count(*)::int FROM scoped_sessions WHERE connected_at IS NOT NULL) AS "connectedCalls",
          (SELECT count(*)::int FROM scoped_sessions WHERE status = 'ended') AS "completedCalls",
          (SELECT count(*)::int FROM scoped_sessions WHERE status IN ('failed', 'expired')) AS "failedCalls",
          (SELECT count(*)::int FROM tenancy.voice_turns turn
            JOIN scoped_sessions session ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
            WHERE turn.status = 'completed') AS "completedTurns",
          (SELECT count(*)::int FROM tenancy.voice_turns turn
            JOIN scoped_sessions session ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
            WHERE turn.status = 'failed') AS "failedTurns",
          (SELECT count(DISTINCT conversation.lead_id)::int FROM scoped_sessions session
            JOIN tenancy.conversations conversation
              ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
            WHERE conversation.lead_id IS NOT NULL) AS leads,
          (SELECT count(DISTINCT request.id)::int FROM scoped_sessions session
            JOIN tenancy.appointment_requests request
              ON request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id)
            AS "appointmentRequests",
          (SELECT count(DISTINCT callback.id)::int FROM scoped_sessions session
            JOIN tenancy.voice_callback_requests callback
              ON callback.tenant_id = session.tenant_id AND callback.session_id = session.id)
            AS "callbackRequests",
          (SELECT COALESCE(sum(settled_minutes), 0)::int FROM scoped_sessions) AS "settledMinutes",
          (SELECT count(*)::int FROM (
            SELECT connection.session_id FROM tenancy.voice_session_connections connection
            JOIN scoped_sessions session
              ON session.tenant_id = connection.tenant_id AND session.id = connection.session_id
            GROUP BY connection.tenant_id, connection.session_id HAVING count(*) > 1
          ) reconnecting) AS "reconnectingCalls",
          (SELECT avg(EXTRACT(EPOCH FROM (ended_at - connected_at)))::float8 FROM scoped_sessions
            WHERE connected_at IS NOT NULL AND ended_at IS NOT NULL) AS "averageConnectedSeconds",
          (SELECT avg(EXTRACT(EPOCH FROM (turn.completed_at - turn.started_at)) * 1000)::float8
            FROM tenancy.voice_turns turn JOIN scoped_sessions session
              ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
            WHERE turn.status = 'completed' AND turn.completed_at IS NOT NULL) AS "averageTurnMilliseconds",
          (SELECT percentile_cont(0.95) WITHIN GROUP (
              ORDER BY EXTRACT(EPOCH FROM (turn.completed_at - turn.started_at)) * 1000
            )::float8
            FROM tenancy.voice_turns turn JOIN scoped_sessions session
              ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
            WHERE turn.status = 'completed' AND turn.completed_at IS NOT NULL) AS "p95TurnMilliseconds"
      `;
      const advanced = authority.entitlements["analytics.level"] === "advanced";
      let outcomes: VoiceAnalytics["outcomes"] = [];
      let languages: VoiceAnalytics["languages"] = [];
      let terminalReasons: VoiceAnalytics["terminalReasons"] = [];
      let turnFailures: VoiceAnalytics["turnFailures"] = [];
      let daily: VoiceAnalytics["daily"] = [];
      if (advanced) {
        outcomes = await sql<{ outcome: string; calls: number }[]>`
          SELECT outcome.outcome_code AS outcome, count(*)::int AS calls
          FROM tenancy.voice_call_outcomes outcome
          JOIN tenancy.voice_sessions session
            ON session.tenant_id = outcome.tenant_id AND session.id = outcome.session_id
          WHERE outcome.tenant_id = ${context.tenantId}::uuid
            AND session.created_at >= now() - make_interval(days => ${periodDays})
            AND (${deploymentId}::uuid IS NULL OR session.deployment_id = ${deploymentId}::uuid)
          GROUP BY outcome.outcome_code ORDER BY count(*) DESC, outcome.outcome_code
        `;
        languages = await sql<{ locale: "th" | "en"; calls: number }[]>`
          SELECT session.locale, count(*)::int AS calls FROM tenancy.voice_sessions session
          WHERE session.tenant_id = ${context.tenantId}::uuid
            AND session.created_at >= now() - make_interval(days => ${periodDays})
            AND (${deploymentId}::uuid IS NULL OR session.deployment_id = ${deploymentId}::uuid)
          GROUP BY session.locale ORDER BY session.locale
        `;
        terminalReasons = await sql<{ reason: string; calls: number }[]>`
          SELECT session.terminal_reason AS reason, count(*)::int AS calls
          FROM tenancy.voice_sessions session
          WHERE session.tenant_id = ${context.tenantId}::uuid
            AND session.created_at >= now() - make_interval(days => ${periodDays})
            AND (${deploymentId}::uuid IS NULL OR session.deployment_id = ${deploymentId}::uuid)
            AND session.terminal_reason IS NOT NULL
          GROUP BY session.terminal_reason ORDER BY count(*) DESC, session.terminal_reason
        `;
        turnFailures = await sql<{ errorCode: string; turns: number }[]>`
          SELECT turn.safe_error_code AS "errorCode", count(*)::int AS turns
          FROM tenancy.voice_turns turn JOIN tenancy.voice_sessions session
            ON session.tenant_id = turn.tenant_id AND session.id = turn.session_id
          WHERE turn.tenant_id = ${context.tenantId}::uuid AND turn.status = 'failed'
            AND turn.started_at >= now() - make_interval(days => ${periodDays})
            AND (${deploymentId}::uuid IS NULL OR session.deployment_id = ${deploymentId}::uuid)
            AND turn.safe_error_code IS NOT NULL
          GROUP BY turn.safe_error_code ORDER BY count(*) DESC, turn.safe_error_code
        `;
        daily = await sql<{
          date: string; sessions: number; completedCalls: number; failedCalls: number; leads: number;
        }[]>`
          WITH days AS (
            SELECT generate_series(
              current_date - (${periodDays}::int - 1), current_date, interval '1 day'
            )::date AS day
          )
          SELECT days.day::text AS date, count(session.id)::int AS sessions,
            count(session.id) FILTER (WHERE session.status = 'ended')::int AS "completedCalls",
            count(session.id) FILTER (WHERE session.status IN ('failed', 'expired'))::int AS "failedCalls",
            count(DISTINCT conversation.lead_id) FILTER (WHERE conversation.lead_id IS NOT NULL)::int AS leads
          FROM days LEFT JOIN tenancy.voice_sessions session
            ON session.tenant_id = ${context.tenantId}::uuid
            AND session.created_at >= days.day::timestamptz
            AND session.created_at < (days.day + 1)::timestamptz
            AND (${deploymentId}::uuid IS NULL OR session.deployment_id = ${deploymentId}::uuid)
          LEFT JOIN tenancy.conversations conversation
            ON conversation.tenant_id = session.tenant_id AND conversation.id = session.conversation_id
          GROUP BY days.day ORDER BY days.day
        `;
      }
      return {
        periodDays, level: advanced ? "advanced" : "core", deploymentId,
        summary: summaryRows[0]!, outcomes, languages, terminalReasons, turnFailures, daily,
      };
    });
  }

  async updateStudio(context: TenantContext, deploymentId: string, input: Readonly<{
    revision: number; name: string; agentName: string; businessName: string;
    defaultLocale: "th" | "en"; allowedOrigins: readonly string[];
    greetingTh: string; greetingEn: string; automatedDisclosureTh: string;
    automatedDisclosureEn: string; maxCallSeconds: number; reconnectWindowSeconds: number;
    definition: unknown; knowledgeRevisionIds: readonly string[];
  }>) {
    const origins = [...new Set(input.allowedOrigins.map(normalizeExactWebsiteOrigin))];
    if (!origins.length || origins.some((origin) => origin === null)) return { status: "validation_failed" as const };
    const definition = aiPlaybookSchema.parse({
      ...(input.definition as object), agentName: input.agentName, businessName: input.businessName,
      languages: ["th", "en"], greeting: { th: input.greetingTh, en: input.greetingEn },
    });
    try { new Intl.DateTimeFormat("en", { timeZone: definition.timezone }).format(new Date()); }
    catch { return { status: "validation_failed" as const }; }
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const deployments = await sql<{
        agentId: string; status: "active" | "disabled" | "revoked";
        capabilityProfile: VoiceCapabilityProfile;
      }[]>`
        SELECT agent_id AS "agentId", status, capability_profile AS "capabilityProfile"
        FROM tenancy.voice_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid FOR UPDATE
      `;
      const deployment = deployments[0];
      if (!deployment) return { status: "not_found" as const };
      if (!(await voiceResourceWritable(sql, deploymentId))) return { status: "resource_read_only" as const };
      if (!(await hasVoiceAuthority(sql, context.tenantId, deployment.capabilityProfile))) {
        return { status: "not_entitled" as const };
      }
      if (deployment.status === "revoked") return { status: "not_allowed" as const };
      const revisionIds = [...new Set(input.knowledgeRevisionIds)];
      const available = revisionIds.length ? await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.knowledge_source_revisions
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'ready'
          AND id = ANY(${revisionIds}::uuid[])
      ` : [{ count: 0 }];
      if (available[0]?.count !== revisionIds.length) return { status: "validation_failed" as const };
      if (definition.notificationProfileId) {
        const profiles = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM tenancy.notification_profiles
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${definition.notificationProfileId}::uuid
            AND status = 'active' AND 'ai_chat.lead_qualified' = ANY(allowed_template_keys)
        `;
        if (profiles[0]?.count !== 1) return { status: "validation_failed" as const };
      }
      const updated = await sql<{ revision: number }[]>`
        UPDATE tenancy.ai_playbook_drafts SET definition_json = ${sql.json(definition)},
          knowledge_revision_ids = ${revisionIds}, revision = revision + 1,
          updated_by_membership_id = ${context.membershipId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${deployment.agentId}::uuid
          AND revision = ${input.revision}
        RETURNING revision
      `;
      if (!updated[0]) return { status: "conflict" as const };
      await sql`
        UPDATE tenancy.ai_agents SET name = ${input.agentName}, default_language = ${input.defaultLocale}, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deployment.agentId}::uuid
      `;
      await sql`
        UPDATE tenancy.voice_deployments SET name = ${input.name}, allowed_origins = ${origins as string[]},
          default_locale = ${input.defaultLocale}, greeting_th = ${input.greetingTh}, greeting_en = ${input.greetingEn},
          automated_disclosure_th = ${input.automatedDisclosureTh},
          automated_disclosure_en = ${input.automatedDisclosureEn},
          max_call_seconds = ${input.maxCallSeconds}, reconnect_window_seconds = ${input.reconnectWindowSeconds},
          updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'voice.studio.saved', 'voice_deployment', ${deploymentId}, ${context.requestId}, 'succeeded',
          ${sql.json({ revision: updated[0].revision, knowledgeRevisionCount: revisionIds.length })}
        )
      `;
      return { status: "updated" as const, revision: updated[0].revision };
    });
  }

  async publishStudio(context: TenantContext, deploymentId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        agentId: string; status: "active" | "disabled" | "revoked";
        capabilityProfile: VoiceCapabilityProfile;
        definition: unknown; knowledgeRevisionIds: string[];
      }[]>`
        SELECT deployment.agent_id AS "agentId", deployment.status,
               deployment.capability_profile AS "capabilityProfile",
               draft.definition_json AS definition, draft.knowledge_revision_ids AS "knowledgeRevisionIds"
        FROM tenancy.voice_deployments deployment
        JOIN tenancy.ai_playbook_drafts draft
          ON draft.tenant_id = deployment.tenant_id AND draft.agent_id = deployment.agent_id
        WHERE deployment.tenant_id = ${context.tenantId}::uuid AND deployment.id = ${deploymentId}::uuid
        FOR UPDATE OF deployment, draft
      `;
      const row = rows[0];
      if (!row) return { status: "not_found" as const };
      if (!(await voiceResourceWritable(sql, deploymentId))) return { status: "resource_read_only" as const };
      if (!(await hasVoiceAuthority(sql, context.tenantId, row.capabilityProfile))) {
        return { status: "not_entitled" as const };
      }
      if (row.status === "revoked") return { status: "not_allowed" as const };
      const available = row.knowledgeRevisionIds.length ? await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.knowledge_source_revisions
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'ready'
          AND id = ANY(${row.knowledgeRevisionIds}::uuid[])
      ` : [{ count: 0 }];
      if (available[0]?.count !== row.knowledgeRevisionIds.length) return { status: "validation_failed" as const };
      const versions = await sql<{ version: number }[]>`
        SELECT COALESCE(max(version), 0)::int + 1 AS version FROM tenancy.ai_playbook_versions
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${row.agentId}::uuid
      `;
      const version = versions[0]!.version; const versionId = randomUUID();
      const playbook = aiPlaybookSchema.parse({ ...(row.definition as object), playbookVersionId: versionId });
      const serialized = JSON.stringify(playbook);
      await sql`
        INSERT INTO tenancy.ai_playbook_versions (
          id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256, published_by_membership_id
        ) VALUES (
          ${versionId}::uuid, ${context.tenantId}::uuid, ${row.agentId}::uuid, ${version}, 'published',
          ${sql.json(playbook)}, ${createHash("sha256").update(serialized).digest()}, ${context.membershipId}::uuid
        )
      `;
      for (const revisionId of row.knowledgeRevisionIds) await sql`
        INSERT INTO tenancy.ai_playbook_knowledge (tenant_id, agent_id, playbook_version_id, source_revision_id)
        VALUES (${context.tenantId}::uuid, ${row.agentId}::uuid, ${versionId}::uuid, ${revisionId}::uuid)
      `;
      await sql`
        UPDATE tenancy.ai_agents SET status = 'active', current_published_playbook_version_id = ${versionId}::uuid,
          updated_at = now() WHERE tenant_id = ${context.tenantId}::uuid AND id = ${row.agentId}::uuid
      `;
      await sql`
        UPDATE tenancy.ai_playbook_drafts SET based_on_version_id = ${versionId}::uuid,
          definition_json = ${sql.json(playbook)}, revision = revision + 1, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND agent_id = ${row.agentId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'voice.playbook.published', 'voice_deployment', ${deploymentId}, ${context.requestId}, 'succeeded',
          ${sql.json({ playbookVersionId: versionId, version })}
        )
      `;
      return { status: "published" as const, playbookVersionId: versionId, version };
    });
  }

  async create(context: TenantContext, input: Readonly<{
    name: string; agentId: string; allowedOrigins: readonly string[];
    maxCallSeconds: number; reconnectWindowSeconds: number;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await hasVoiceAuthority(sql, context.tenantId);
      if (!authority) return { status: "not_entitled" as const };
      const origins = [...new Set(input.allowedOrigins.map(normalizeExactWebsiteOrigin))];
      if (!origins.length || origins.some((origin) => origin === null)) return { status: "validation_failed" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:voice:active_bots`}, 0))`;
      const counts = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.voice_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
      `;
      const activeBotLimit = authority.limits.active_bots;
      if (typeof activeBotLimit === "number" && (counts[0]?.count ?? 0) >= activeBotLimit) {
        return { status: "limit_reached" as const };
      }
      const deploymentId = randomUUID();
      const deploymentKey = `djay_voice_deploy_${createOpaqueToken()}`;
      const configurations = await sql<{
        agentId: string; playbookVersionId: string; defaultLocale: "th" | "en"; playbook: unknown;
      }[]>`
        SELECT agent.id AS "agentId", agent.current_published_playbook_version_id AS "playbookVersionId",
               agent.default_language AS "defaultLocale", version.playbook_json AS playbook
        FROM tenancy.ai_agents agent
        JOIN tenancy.ai_playbook_versions version
          ON version.tenant_id = agent.tenant_id AND version.id = agent.current_published_playbook_version_id
        WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.id = ${input.agentId}::uuid
          AND agent.product_family = 'voice' AND agent.status = 'active'
        FOR UPDATE OF agent
      `;
      const configuration = configurations[0];
      if (!configuration) return { status: "configuration_required" as const };
      const published = aiPlaybookSchema.parse(configuration.playbook);
      const automatedDisclosureTh = published.builderContext?.voiceDisclosure?.th
        ?? "นี่คือผู้ช่วยเสียง AI และสายนี้อาจถูกถอดความ";
      const automatedDisclosureEn = published.builderContext?.voiceDisclosure?.en
        ?? "This is an AI voice assistant and this call may be transcribed.";
      await sql`
        INSERT INTO tenancy.voice_deployments (
          id, tenant_id, agent_id, name, capability_profile, deployment_key_hash, key_prefix, allowed_origins,
          default_locale, greeting_th, greeting_en, automated_disclosure_th,
          automated_disclosure_en, max_call_seconds, reconnect_window_seconds,
          traffic_status, live_at, created_by_membership_id
        ) VALUES (
          ${deploymentId}::uuid, ${context.tenantId}::uuid, ${configuration.agentId}::uuid, ${input.name},
          ${authority.capabilityProfile},
          ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 20)}, ${origins as string[]},
          ${configuration.defaultLocale}, ${published.greeting.th}, ${published.greeting.en},
          ${automatedDisclosureTh}, ${automatedDisclosureEn},
          ${input.maxCallSeconds}, ${input.reconnectWindowSeconds}, 'inactive', NULL, ${context.membershipId}::uuid
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'voice.deployment.created', 'voice_deployment', ${deploymentId}, ${context.requestId},
          'succeeded', ${sql.json({
            allowedOriginCount: origins.length,
            publicLabel: publicLabel(authority.capabilityProfile),
          })}
        )
      `;
      return { status: "created" as const, deploymentId, deploymentKey };
    });
  }

  async requestInstallCheck(context: TenantContext, deploymentId: string, targetOrigin: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ allowed_origins: string[] }[]>`
        SELECT allowed_origins FROM tenancy.voice_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid AND status = 'active'
      `;
      if (!rows[0]?.allowed_origins.includes(targetOrigin)) return { status: "not_found" as const };
      if (!(await hasVoiceAuthority(sql, context.tenantId))) return { status: "not_entitled" as const };
      const checkId = randomUUID();
      await sql`INSERT INTO tenancy.voice_install_checks
        (id, tenant_id, deployment_id, requested_by_membership_id, target_origin, status)
        VALUES (${checkId}::uuid, ${context.tenantId}::uuid, ${deploymentId}::uuid,
          ${context.membershipId}::uuid, ${targetOrigin}, 'requested')`;
      return { status: "requested" as const, checkId };
    });
  }

  async listInstallChecks(context: TenantContext, deploymentId?: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; deploymentId: string; targetOrigin: string; status: string;
      safeResultCode: string | null; checkedAt: Date | null; createdAt: Date;
    }[]>`
      SELECT id, deployment_id AS "deploymentId", target_origin AS "targetOrigin", status,
             safe_result_code AS "safeResultCode", checked_at AS "checkedAt", created_at AS "createdAt"
      FROM tenancy.voice_install_checks
      WHERE tenant_id = ${context.tenantId}::uuid
        AND (${deploymentId ?? null}::uuid IS NULL OR deployment_id = ${deploymentId ?? null}::uuid)
      ORDER BY created_at DESC, id DESC LIMIT 200
    `);
  }

  async changeTraffic(context: TenantContext, deploymentId: string, action: "go_live" | "stop") {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        status: "active" | "disabled" | "revoked"; traffic_status: "inactive" | "live";
        live_playbook_version_id: string | null;
        capability_profile: VoiceCapabilityProfile; allowed_origins: string[];
        current_published_playbook_version_id: string | null; agent_status: string;
      }[]>`
        SELECT deployment.status, deployment.traffic_status, deployment.live_playbook_version_id,
               deployment.capability_profile,
               deployment.allowed_origins, agent.current_published_playbook_version_id,
               agent.status AS agent_status
        FROM tenancy.voice_deployments deployment
        JOIN tenancy.ai_agents agent ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
        WHERE deployment.tenant_id = ${context.tenantId}::uuid AND deployment.id = ${deploymentId}::uuid
        FOR UPDATE OF deployment, agent
      `;
      const deployment = rows[0];
      if (!deployment) return { status: "not_found" as const };
      if (action === "stop") {
        if (deployment.traffic_status === "inactive") return { status: "unchanged" as const, trafficStatus: "inactive" as const };
        await sql`UPDATE tenancy.voice_deployments SET traffic_status = 'inactive', updated_at = now()
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid`;
        await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action,
          target_type, target_id, request_id, result, metadata) VALUES (${context.tenantId}::uuid,
          ${context.userId}::uuid, ${context.membershipId}::uuid, 'voice.deployment.stop_traffic',
          'voice_deployment', ${deploymentId}, ${context.requestId}, 'succeeded', '{}'::jsonb)`;
        return { status: "updated" as const, trafficStatus: "inactive" as const };
      }
      const authority = await hasVoiceAuthority(sql, context.tenantId, deployment.capability_profile);
      if (!authority) return { status: "not_entitled" as const };
      if (deployment.status !== "active") return { status: "deployment_unavailable" as const };
      if (deployment.agent_status !== "active" || !deployment.current_published_playbook_version_id) {
        return { status: "not_published" as const };
      }
      if (!(await voiceResourceWritable(sql, deploymentId))) return { status: "resource_read_only" as const };
      const verified = await sql<{ verified: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM tenancy.voice_install_checks check_record
          WHERE check_record.tenant_id = ${context.tenantId}::uuid
            AND check_record.deployment_id = ${deploymentId}::uuid AND check_record.status = 'verified'
            AND check_record.target_origin = ANY(${deployment.allowed_origins}::text[])) AS verified
      `;
      if (!verified[0]?.verified) return { status: "verification_required" as const };
      const quota = await sql<{ available: boolean }[]>`
        SELECT EXISTS (SELECT 1 FROM tenancy.quota_accounts account
          WHERE account.tenant_id = ${context.tenantId}::uuid
            AND account.subscription_id = ${authority.subscriptionId}::uuid
            AND account.product_key = 'voice' AND account.customer_unit = 'voice_minute'
            AND account.period_start <= now() AND account.period_end > now()
            AND (account.safety_cap_quantity IS NULL
              OR account.reserved_quantity + account.settled_quantity < account.safety_cap_quantity)) AS available
      `;
      if (!quota[0]?.available) return { status: "quota_unavailable" as const };
      await sql`UPDATE tenancy.voice_deployments SET traffic_status = 'live',
        live_playbook_version_id = ${deployment.current_published_playbook_version_id}::uuid, live_at = now(),
        live_by_membership_id = ${context.membershipId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action,
        target_type, target_id, request_id, result, metadata) VALUES (${context.tenantId}::uuid,
        ${context.userId}::uuid, ${context.membershipId}::uuid, 'voice.deployment.go_live',
        'voice_deployment', ${deploymentId}, ${context.requestId}, 'succeeded', ${sql.json({
          publishedVersionId: deployment.current_published_playbook_version_id,
          allowedOrigins: deployment.allowed_origins,
        })})`;
      return { status: deployment.traffic_status === "live"
        && deployment.live_playbook_version_id === deployment.current_published_playbook_version_id
        ? "unchanged" as const : "updated" as const,
        trafficStatus: "live" as const };
    });
  }

  async changeStatus(context: TenantContext, deploymentId: string, action: "enable" | "disable" | "revoke") {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        status: "active" | "disabled" | "revoked"; capabilityProfile: VoiceCapabilityProfile;
      }[]>`
        SELECT status, capability_profile AS "capabilityProfile" FROM tenancy.voice_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid FOR UPDATE
      `;
      const current = rows[0];
      if (!current) return { status: "not_found" as const };
      if (current.status === "revoked") return { status: action === "revoke" ? "unchanged" as const : "not_allowed" as const };
      if (action === "enable" && !(await hasVoiceAuthority(sql, context.tenantId, current.capabilityProfile))) {
        return { status: "not_entitled" as const };
      }
      const next = action === "enable" ? "active" : action === "disable" ? "disabled" : "revoked";
      if (current.status === next) return { status: "unchanged" as const };
      await sql`
        UPDATE tenancy.voice_deployments SET status = ${next}, updated_at = now(),
          traffic_status = CASE WHEN ${next} = 'active' THEN traffic_status ELSE 'inactive' END,
          revoked_at = CASE WHEN ${next} = 'revoked' THEN now() ELSE NULL END
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          ${`voice.deployment.${action}`}, 'voice_deployment', ${deploymentId}, ${context.requestId},
          'succeeded', ${sql.json({ from: current.status, to: next, trafficStopped: next !== "active" })}
        )
      `;
      return { status: "updated" as const, deploymentStatus: next };
    });
  }
}
