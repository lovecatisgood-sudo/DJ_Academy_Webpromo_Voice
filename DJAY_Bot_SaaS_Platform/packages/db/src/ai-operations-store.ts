import { randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

export type AiIntegrationKind = "google_sheets" | "webhook" | "crm";
export type AiIntegrationEvent = "conversation_updated" | "lead_qualified" | "handover_requested" | "appointment_requested";

export class TenantAiOperationsStore {
  constructor(private readonly client: DatabaseClient) {}

  async insights(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const conversations = await sql<{ conversationId: string; summary: string; intent: string; unansweredCount: number; leadScore: number; segment: string; routingTeamKey: string | null; updatedAt: Date }[]>`
        SELECT conversation_id AS "conversationId", summary_text AS summary, latest_intent AS intent,
          unanswered_count AS "unansweredCount", lead_score::int AS "leadScore", segment,
          routing_team_key AS "routingTeamKey", updated_at AS "updatedAt"
        FROM tenancy.ai_conversation_insights WHERE tenant_id = ${context.tenantId}::uuid ORDER BY updated_at DESC LIMIT 100`;
      const customers = await sql<{ contactId: string; displayName: string; summary: string; leadScore: number; segment: string; updatedAt: Date }[]>`
        SELECT insight.contact_id AS "contactId", contact.display_name AS "displayName", insight.summary_text AS summary,
          insight.lead_score::int AS "leadScore", insight.segment, insight.updated_at AS "updatedAt"
        FROM tenancy.ai_contact_insights insight JOIN tenancy.contacts contact ON contact.tenant_id = insight.tenant_id AND contact.id = insight.contact_id
        WHERE insight.tenant_id = ${context.tenantId}::uuid ORDER BY insight.lead_score DESC, insight.updated_at DESC LIMIT 100`;
      return { conversations, customers };
    });
  }

  async listTeams(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{ id: string; teamKey: string; name: string; status: string; memberCount: number }[]>`
      SELECT team.id, team.team_key AS "teamKey", team.name, team.status, count(member.membership_id)::int AS "memberCount"
      FROM tenancy.tenant_teams team LEFT JOIN tenancy.tenant_team_members member ON member.tenant_id = team.tenant_id AND member.team_id = team.id
      WHERE team.tenant_id = ${context.tenantId}::uuid GROUP BY team.id ORDER BY team.name`);
  }

  async createTeam(context: TenantContext, input: Readonly<{ teamKey: string; name: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const id = randomUUID();
      const rows = await sql<{ id: string }[]>`INSERT INTO tenancy.tenant_teams (id, tenant_id, team_key, name, created_by_membership_id)
        VALUES (${id}::uuid, ${context.tenantId}::uuid, ${input.teamKey}, ${input.name}, ${context.membershipId}::uuid)
        ON CONFLICT (tenant_id, team_key) DO NOTHING RETURNING id`;
      return rows[0] ? { status: "created" as const, teamId: rows[0].id } : { status: "already_exists" as const };
    });
  }

  async addTeamMember(context: TenantContext, teamId: string, membershipId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ membershipId: string }[]>`INSERT INTO tenancy.tenant_team_members (tenant_id, team_id, membership_id)
        SELECT ${context.tenantId}::uuid, team.id, membership.id FROM tenancy.tenant_teams team JOIN tenancy.memberships membership
          ON membership.tenant_id = team.tenant_id AND membership.id = ${membershipId}::uuid AND membership.status = 'active'
        WHERE team.tenant_id = ${context.tenantId}::uuid AND team.id = ${teamId}::uuid AND team.status = 'active'
        ON CONFLICT DO NOTHING RETURNING membership_id AS "membershipId"`;
      return rows[0] ? { status: "added" as const } : { status: "not_addable" as const };
    });
  }

  async listIntegrations(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{ id: string; name: string; integrationKind: AiIntegrationKind; eventTypes: AiIntegrationEvent[]; status: string; createdAt: Date }[]>`
      SELECT id, name, integration_kind AS "integrationKind", event_types AS "eventTypes", status, created_at AS "createdAt"
      FROM tenancy.ai_integration_profiles WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at DESC`);
  }

  async createIntegration(context: TenantContext, input: Readonly<{
    name: string; integrationKind: AiIntegrationKind; eventTypes: readonly AiIntegrationEvent[];
    config: Record<string, unknown>; envelopeKey: Buffer;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await sql<{ entitled: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.entitlement_snapshots snapshot
        JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id AND subscription.id = snapshot.subscription_id
        WHERE snapshot.tenant_id = ${context.tenantId}::uuid AND snapshot.product_key = 'ai_chat' AND snapshot.access_mode = 'active'
          AND subscription.status IN ('active','trialing','scheduled_change')
          AND ((snapshot.resolved_json->'entitlements'->>'integration.webhook')::boolean IS TRUE
            OR (snapshot.resolved_json->'entitlements'->>'integration.google_sheets')::boolean IS TRUE
            OR (snapshot.resolved_json->'entitlements'->>'integration.crm')::boolean IS TRUE)) AS entitled`;
      if (!authority[0]?.entitled) return { status: "not_entitled" as const };
      const id = randomUUID();
      await sql`INSERT INTO tenancy.ai_integration_profiles (id, tenant_id, name, integration_kind, config_ciphertext, event_types, created_by_membership_id)
        VALUES (${id}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.integrationKind},
          ${sealJson(input.config, input.envelopeKey)}, ${input.eventTypes as string[]}, ${context.membershipId}::uuid)`;
      return { status: "created" as const, integrationId: id };
    });
  }
}

export type AiIntegrationClaim = Readonly<{
  job_id: string; tenant_id: string; integration_kind: AiIntegrationKind; config_ciphertext: string;
  event_type: AiIntegrationEvent; conversation_id: string; contact_id: string; summary_text: string;
  lead_score: number; segment: string; attempt_count: number;
}>;

export class AiIntegrationWorkerStore {
  constructor(private readonly client: DatabaseClient) {}
  async claim() {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'ai_integration_worker', true)`;
      const now = new Date();
      const rows = await sql<AiIntegrationClaim[]>`SELECT * FROM tenancy.claim_ai_integration_job(${now}, ${new Date(now.getTime() - 5 * 60_000)})`;
      return rows[0] ?? null;
    });
  }
  async finish(jobId: string, delivered: boolean, safeErrorCode?: string) {
    const rows = await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'ai_integration_worker', true)`;
      return sql<{ changed: boolean }[]>`SELECT tenancy.finish_ai_integration_job(${jobId}::uuid, ${delivered}, ${safeErrorCode ?? null}) AS changed`;
    });
    return rows[0]?.changed === true;
  }
}
