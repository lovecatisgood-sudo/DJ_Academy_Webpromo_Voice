import { createHash, randomUUID } from "node:crypto";
import { createOpaqueToken, hashOpaqueToken } from "@djay/auth";
import { flowBusinessScheduleSchema, flowbotDowngradeBlockers, flowSnapshotSchema, validateFlowForPublish, type FlowEntitlements, type FlowSnapshot, type FlowValidationIssue, type PublicFlowInput } from "@djay/flowbot-domain";
import { FlowRuntimeError, simulateFlow } from "@djay/flowbot-engine";
import {
  flowbotRoutingTeamFormError,
  flowbotScheduleFormError,
  normalizeExactWebsiteOrigin,
  uuidSchema,
} from "@djay/shared";
import type { TenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

type FlowAuthority = FlowEntitlements & Readonly<{ snapshotId: string; subscriptionId: string }>;

async function flowResourceWritable(sql: postgres.TransactionSql, botId: string) {
  const rows = await sql<{ writable: boolean }[]>`
    SELECT tenancy.entitlement_resource_is_writable('flowbot', 'bot', ${botId}::uuid) AS writable
  `;
  return rows[0]?.writable === true;
}

export class FlowBotStore {
  constructor(private readonly client: DatabaseClient) {}

  private async embedSubflows(sql: postgres.TransactionSql, tenantId: string, snapshot: FlowSnapshot): Promise<FlowSnapshot> {
    const targetIds = [...new Set(Object.values(snapshot.nodes)
      .filter((node): node is Extract<(typeof node), { type: "subflow" }> => node.type === "subflow")
      .map((node) => node.targetFlowVersionId))];
    if (!targetIds.length) return { ...snapshot, embeddedSubflows: undefined };
    const rows = await sql<{ id: string; snapshot_json: unknown }[]>`
      SELECT id, snapshot_json FROM tenancy.flow_versions
      WHERE tenant_id = ${tenantId}::uuid AND status = 'published' AND id = ANY(${targetIds}::uuid[])
    `;
    if (rows.length !== targetIds.length) throw new Error("subflow_version_not_available");
    const embedded: NonNullable<FlowSnapshot["embeddedSubflows"]> = {};
    for (const row of rows) {
      const child = flowSnapshotSchema.parse(row.snapshot_json);
      embedded[row.id] = { rootNodeId: child.rootNodeId, nodes: child.nodes, keywords: child.keywords };
      Object.assign(embedded, child.embeddedSubflows ?? {});
    }
    if (Object.keys(embedded).length > 100) throw new Error("subflow_bundle_limit");
    return { ...snapshot, embeddedSubflows: embedded };
  }

  private async referenceIssues(
    sql: postgres.TransactionSql,
    tenantId: string,
    snapshot: FlowSnapshot,
  ): Promise<readonly FlowValidationIssue[]> {
    const issues: FlowValidationIssue[] = [];
    const webhooks = Object.values(snapshot.nodes)
      .filter((node): node is Extract<(typeof node), { type: "webhook" }> => node.type === "webhook")
      .map((node) => ({ node_id: node.id, profile_id: node.integrationProfileId, template_key: node.templateKey }));
    if (webhooks.length) {
      const invalid = await sql<{ node_id: string }[]>`
        SELECT reference.node_id::text
        FROM jsonb_to_recordset(${sql.json(webhooks)}::jsonb)
          AS reference(node_id uuid, profile_id uuid, template_key text)
        LEFT JOIN tenancy.flow_integration_profiles profile
          ON profile.tenant_id = ${tenantId}::uuid
          AND profile.id = reference.profile_id
          AND profile.status = 'approved'
          AND reference.template_key = ANY(profile.allowed_template_keys)
        WHERE profile.id IS NULL
      `;
      for (const row of invalid) issues.push({ code: "integration_profile_not_approved", nodeId: row.node_id });
    }
    const subflows = Object.values(snapshot.nodes)
      .filter((node): node is Extract<(typeof node), { type: "subflow" }> => node.type === "subflow")
      .map((node) => ({ node_id: node.id, version_id: node.targetFlowVersionId }));
    if (subflows.length) {
      const invalid = await sql<{ node_id: string }[]>`
        SELECT reference.node_id::text
        FROM jsonb_to_recordset(${sql.json(subflows)}::jsonb)
          AS reference(node_id uuid, version_id uuid)
        LEFT JOIN tenancy.flow_versions version
          ON version.tenant_id = ${tenantId}::uuid
          AND version.id = reference.version_id
          AND version.status = 'published'
        WHERE version.id IS NULL
      `;
      for (const row of invalid) issues.push({ code: "subflow_version_not_available", nodeId: row.node_id });
    }
    const schedules = Object.values(snapshot.nodes)
      .filter((node): node is Extract<(typeof node), { type: "business_hours" }> => node.type === "business_hours")
      .map((node) => ({ node_id: node.id, schedule_key: node.scheduleKey, timezone: node.timezone }));
    if (schedules.length) {
      const invalid = await sql<{ node_id: string }[]>`
        SELECT reference.node_id::text
        FROM jsonb_to_recordset(${sql.json(schedules)}::jsonb)
          AS reference(node_id uuid, schedule_key text, timezone text)
        LEFT JOIN tenancy.flow_business_schedules schedule
          ON schedule.tenant_id = ${tenantId}::uuid
          AND schedule.schedule_key = reference.schedule_key
          AND schedule.timezone = reference.timezone
        WHERE schedule.id IS NULL
      `;
      for (const row of invalid) issues.push({ code: "business_schedule_not_available", nodeId: row.node_id });
    }
    const teams = Object.values(snapshot.nodes)
      .filter((node): node is Extract<(typeof node), { type: "team_route" }> => node.type === "team_route")
      .map((node) => ({ node_id: node.id, team_key: node.teamKey }));
    if (teams.length) {
      const invalid = await sql<{ node_id: string }[]>`
        SELECT reference.node_id::text
        FROM jsonb_to_recordset(${sql.json(teams)}::jsonb)
          AS reference(node_id uuid, team_key text)
        LEFT JOIN tenancy.flow_routing_teams team
          ON team.tenant_id = ${tenantId}::uuid
          AND team.team_key = reference.team_key AND team.status = 'active'
        WHERE team.id IS NULL
      `;
      for (const row of invalid) issues.push({ code: "routing_team_not_available", nodeId: row.node_id });
    }
    return issues;
  }

  private async authority(sql: postgres.TransactionSql, tenantId: string): Promise<FlowAuthority | null> {
    const rows = await sql<{
      id: string; subscription_id: string; access_mode: "none" | "read_only" | "active";
      resolved_json: { publicPlanKey?: string; entitlements?: Record<string, boolean | string | number | null>; limits?: Record<string, number | null> };
      plan_key: "flowbot_basic" | "flowbot_premium";
    }[]>`
      SELECT snapshot.id, snapshot.subscription_id, snapshot.access_mode, snapshot.resolved_json, plan.plan_key
      FROM tenancy.entitlement_snapshots snapshot
      JOIN tenancy.product_subscriptions subscription ON subscription.tenant_id = snapshot.tenant_id
        AND subscription.id = snapshot.subscription_id AND subscription.status IN ('active', 'trialing', 'scheduled_change')
      JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id AND plan.product_key = 'flowbot'
      WHERE snapshot.tenant_id = ${tenantId}::uuid AND snapshot.product_key = 'flowbot'
      ORDER BY snapshot.created_at DESC LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    return {
      snapshotId: row.id,
      subscriptionId: row.subscription_id,
      planKey: row.plan_key,
      accessMode: row.access_mode,
      entitlements: row.resolved_json.entitlements ?? {},
      limits: row.resolved_json.limits ?? {},
    };
  }

  async authoringCapabilities(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority) return null;
      const branding = await sql<{ enabled: boolean }[]>`
        SELECT tenancy.active_branding_removal(${context.tenantId}::uuid, 'flowbot') AS enabled
      `;
      return {
        planKey: authority.planKey,
        accessMode: authority.accessMode,
        advancedNodes: authority.entitlements["flow.nodes.advanced"] === true,
        approvedWebhooks: authority.entitlements["flow.webhook"] === "approved",
        teamRouting: authority.entitlements["flow.team_routing"] === true,
        brandingRemoval: branding[0]?.enabled ?? false,
        limits: {
          activeBots: authority.limits.active_bots ?? null,
          nodesPerBot: authority.limits.flow_nodes_per_bot ?? null,
          deployments: authority.limits.deployments ?? null,
        },
      };
    });
  }

  async listBots(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; name: string; status: string; brandingRemoved: boolean; defaultLanguage: string;
      currentPublishedVersionId: string | null; draftRevision: number | null; deploymentCount: number;
      createdAt: Date; updatedAt: Date;
    }[]>`
      SELECT bot.id, bot.name, bot.status, bot.branding_removed AS "brandingRemoved",
             bot.default_language AS "defaultLanguage",
             bot.current_published_version_id AS "currentPublishedVersionId",
             draft.revision AS "draftRevision", count(DISTINCT deployment.id)::int AS "deploymentCount",
             bot.created_at AS "createdAt", bot.updated_at AS "updatedAt"
      FROM tenancy.flow_bots bot
      LEFT JOIN tenancy.flow_drafts draft ON draft.tenant_id = bot.tenant_id AND draft.bot_id = bot.id
      LEFT JOIN tenancy.flow_deployments deployment ON deployment.tenant_id = bot.tenant_id
        AND deployment.bot_id = bot.id AND deployment.status = 'active'
      WHERE bot.tenant_id = ${context.tenantId}::uuid AND bot.status <> 'archived'
      GROUP BY bot.id, draft.revision ORDER BY bot.updated_at DESC, bot.id
    `);
  }

  async createBot(context: TenantContext, input: Readonly<{ name: string; defaultLanguage: "th" | "en" }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.enabled"] !== false) return { status: "not_entitled" as const };
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:flowbot:active_bots`}, 0))`;
      const counts = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM tenancy.flow_bots WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'`;
      const limit = authority.limits.active_bots;
      if (typeof limit === "number" && (counts[0]?.count ?? 0) >= limit) return { status: "limit_reached" as const };
      const botId = randomUUID(); const draftVersionId = randomUUID(); const rootNodeId = randomUUID();
      const definition: FlowSnapshot = {
        schemaVersion: 1, flowVersionId: draftVersionId, rootNodeId, keywords: [],
        nodes: { [rootNodeId]: { id: rootNodeId, type: "message", title: "Welcome", content: { th: "สวัสดีครับ", en: "Welcome" }, nextNodeId: null } },
      };
      await sql`INSERT INTO tenancy.flow_bots (id, tenant_id, name, default_language, created_by_membership_id) VALUES (${botId}::uuid, ${context.tenantId}::uuid, ${input.name}, ${input.defaultLanguage}, ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.flow_drafts (tenant_id, bot_id, definition_json, updated_by_membership_id) VALUES (${context.tenantId}::uuid, ${botId}::uuid, ${sql.json(definition)}, ${context.membershipId}::uuid)`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata) VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'flowbot.bot_created', 'flow_bot', ${botId}, ${context.requestId}, 'succeeded', ${sql.json({ planKey: authority.planKey })})`;
      return { status: "created" as const, botId };
    });
  }

  async getDraft(context: TenantContext, botId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ bot_id: string; revision: number; based_on_version_id: string | null; definition_json: unknown; updated_at: Date }[]>`
        SELECT bot_id, revision, based_on_version_id, definition_json, updated_at FROM tenancy.flow_drafts
        WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid
      `;
      const row = rows[0];
      return row ? { botId: row.bot_id, revision: row.revision, basedOnVersionId: row.based_on_version_id, definition: row.definition_json, updatedAt: row.updated_at } : null;
    });
  }

  async previewDraft(context: TenantContext, botId: string, input: Readonly<{
    language: "th" | "en";
    inputs: readonly PublicFlowInput[];
    startNodeId?: string;
    businessOpen: boolean;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.enabled"] !== false) {
        return { status: "not_entitled" as const };
      }
      const rows = await sql<{ definition_json: unknown; published_version_id: string | null }[]>`
        SELECT draft.definition_json,
          CASE WHEN draft.based_on_version_id = bot.current_published_version_id
            AND draft.definition_json = version.snapshot_json THEN version.id END AS published_version_id
        FROM tenancy.flow_drafts draft
        JOIN tenancy.flow_bots bot ON bot.tenant_id = draft.tenant_id AND bot.id = draft.bot_id
        LEFT JOIN tenancy.flow_versions version ON version.tenant_id = bot.tenant_id
          AND version.bot_id = bot.id AND version.id = bot.current_published_version_id
        WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.bot_id = ${botId}::uuid
          AND bot.status <> 'archived'
      `;
      if (!rows[0]) return { status: "not_found" as const };
      const parsed = flowSnapshotSchema.parse(rows[0].definition_json);
      const snapshot = await this.embedSubflows(sql, context.tenantId, parsed);
      let simulation;
      try {
        simulation = simulateFlow({
          snapshot, authority, language: input.language, inputs: input.inputs,
          ...(input.startNodeId ? { startNodeId: input.startNodeId } : {}),
          businessOpen: input.businessOpen, now: new Date().toISOString(),
        });
      } catch (error) {
        if (error instanceof FlowRuntimeError) return { status: "validation_failed" as const };
        throw error;
      }
      return {
        status: "previewed" as const,
        publishedVersionId: rows[0].published_version_id,
        preview: {
          state: {
            status: simulation.finalState.status,
            currentNodeId: simulation.finalState.currentNodeId,
          },
          turns: simulation.turns.map((turn, index) => ({
            sequence: index + 1,
            messages: turn.result.messages,
            trace: turn.result.events
              .filter((event) => event.type === "node_entered" && event.nodeId)
              .map((event) => event.nodeId!),
            commands: turn.result.commands.map((command) => ({ type: command.type })),
          })),
        },
      };
    });
  }

  async updateDraft(context: TenantContext, botId: string, input: Readonly<{ revision: number; definition: unknown }>) {
    const parsedDefinition = flowSnapshotSchema.parse(input.definition);
    const definition: FlowSnapshot = { ...parsedDefinition, embeddedSubflows: undefined };
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.enabled"] !== false) {
        return { status: "not_entitled" as const };
      }
      if (!(await flowResourceWritable(sql, botId))) return { status: "resource_read_only" as const };
      const issues = validateFlowForPublish(definition, authority);
      const referenceIssues = issues.length ? [] : await this.referenceIssues(sql, context.tenantId, definition);
      if (issues.length || referenceIssues.length) return { status: "validation_failed" as const, issues: [...issues, ...referenceIssues] };
      const rows = await sql<{ revision: number }[]>`
        UPDATE tenancy.flow_drafts SET definition_json = ${sql.json(definition)}, revision = revision + 1,
          updated_by_membership_id = ${context.membershipId}::uuid, updated_at = now()
        WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid AND revision = ${input.revision}
        RETURNING revision
      `;
      return rows[0] ? { status: "updated" as const, revision: rows[0].revision } : { status: "revision_conflict" as const };
    });
  }

  async publish(context: TenantContext, botId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority) return { status: "not_entitled" as const };
      if (!(await flowResourceWritable(sql, botId))) return { status: "resource_read_only" as const };
      const rows = await sql<{ definition_json: unknown; based_on_version_id: string | null }[]>`
        SELECT draft.definition_json, draft.based_on_version_id FROM tenancy.flow_drafts draft
        JOIN tenancy.flow_bots bot ON bot.tenant_id = draft.tenant_id AND bot.id = draft.bot_id
        WHERE draft.tenant_id = ${context.tenantId}::uuid AND draft.bot_id = ${botId}::uuid
          AND bot.status <> 'archived' FOR UPDATE OF draft, bot
      `;
      if (!rows[0]) return { status: "not_found" as const };
      const versionId = randomUUID();
      const parsed = flowSnapshotSchema.parse(rows[0].definition_json);
      const definition = flowSnapshotSchema.parse({ ...parsed, flowVersionId: versionId, embeddedSubflows: undefined });
      const issues = validateFlowForPublish(definition, authority);
      const referenceIssues = issues.length ? [] : await this.referenceIssues(sql, context.tenantId, definition);
      if (issues.length || referenceIssues.length) return { status: "validation_failed" as const, issues: [...issues, ...referenceIssues] };
      const snapshot = await this.embedSubflows(sql, context.tenantId, definition);
      const versions = await sql<{ next_version: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS next_version FROM tenancy.flow_versions WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid`;
      const version = versions[0]!.next_version; const serialized = JSON.stringify(snapshot);
      await sql`INSERT INTO tenancy.flow_versions (id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, source_version_id, published_by_membership_id) VALUES (${versionId}::uuid, ${context.tenantId}::uuid, ${botId}::uuid, ${version}, 'published', ${sql.json(snapshot)}, ${createHash("sha256").update(serialized).digest()}, ${rows[0].based_on_version_id}::uuid, ${context.membershipId}::uuid)`;
      await sql`UPDATE tenancy.flow_bots SET current_published_version_id = ${versionId}::uuid, status = 'active', updated_at = now() WHERE tenant_id = ${context.tenantId}::uuid AND id = ${botId}::uuid`;
      await sql`UPDATE tenancy.flow_drafts SET based_on_version_id = ${versionId}::uuid, definition_json = ${sql.json(snapshot)}, revision = revision + 1, updated_at = now() WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid`;
      await sql`INSERT INTO tenancy.audit_logs (tenant_id, actor_user_id, actor_membership_id, action, target_type, target_id, request_id, result, metadata) VALUES (${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid, 'flowbot.published', 'flow_version', ${versionId}, ${context.requestId}, 'succeeded', ${sql.json({ botId, version, planKey: authority.planKey })})`;
      return { status: "published" as const, versionId, version };
    });
  }

  async rollback(context: TenantContext, botId: string, sourceVersionId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId); if (!authority) return { status: "not_entitled" as const };
      if (!(await flowResourceWritable(sql, botId))) return { status: "resource_read_only" as const };
      const source = await sql<{ snapshot_json: unknown }[]>`SELECT snapshot_json FROM tenancy.flow_versions WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid AND id = ${sourceVersionId}::uuid`;
      if (!source[0]) return { status: "not_found" as const };
      const versionId = randomUUID();
      const sourceSnapshot = flowSnapshotSchema.parse(source[0].snapshot_json);
      const definition = flowSnapshotSchema.parse({ ...sourceSnapshot, flowVersionId: versionId, embeddedSubflows: undefined });
      const issues = validateFlowForPublish(definition, authority);
      const referenceIssues = issues.length ? [] : await this.referenceIssues(sql, context.tenantId, definition);
      if (issues.length || referenceIssues.length) return { status: "validation_failed" as const, issues: [...issues, ...referenceIssues] };
      const snapshot = await this.embedSubflows(sql, context.tenantId, definition);
      const versions = await sql<{ next_version: number }[]>`SELECT COALESCE(max(version), 0)::int + 1 AS next_version FROM tenancy.flow_versions WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid`;
      const version = versions[0]!.next_version;
      await sql`INSERT INTO tenancy.flow_versions (id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, source_version_id, published_by_membership_id) VALUES (${versionId}::uuid, ${context.tenantId}::uuid, ${botId}::uuid, ${version}, 'published', ${sql.json(snapshot)}, ${createHash("sha256").update(JSON.stringify(snapshot)).digest()}, ${sourceVersionId}::uuid, ${context.membershipId}::uuid)`;
      await sql`UPDATE tenancy.flow_bots SET current_published_version_id = ${versionId}::uuid, status = 'active', updated_at = now() WHERE tenant_id = ${context.tenantId}::uuid AND id = ${botId}::uuid`;
      return { status: "published" as const, versionId, version };
    });
  }

  async listVersions(context: TenantContext, botId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{ id: string; version: number; sourceVersionId: string | null; publishedAt: Date }[]>`
      SELECT id, version, source_version_id AS "sourceVersionId", published_at AS "publishedAt"
      FROM tenancy.flow_versions WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid
      ORDER BY version DESC
    `);
  }

  async createDeployment(context: TenantContext, botId: string, input: Readonly<{ name: string; allowedOrigins: readonly string[] }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["ai.enabled"] !== false) {
        return { status: "not_entitled" as const };
      }
      if (!(await flowResourceWritable(sql, botId))) return { status: "resource_read_only" as const };
      const origins = [...new Set(input.allowedOrigins.map(normalizeExactWebsiteOrigin))];
      if (!origins.length || origins.some((value) => value === null)) return { status: "validation_failed" as const };
      const bots = await sql<{ current_published_version_id: string | null }[]>`SELECT current_published_version_id FROM tenancy.flow_bots WHERE tenant_id = ${context.tenantId}::uuid AND id = ${botId}::uuid AND status = 'active'`;
      if (!bots[0]?.current_published_version_id) return { status: "not_published" as const };
      const deployments = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count
        FROM tenancy.flow_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active'
      `;
      const deploymentLimit = authority.limits.deployments;
      if (typeof deploymentLimit === "number" && (deployments[0]?.count ?? 0) >= deploymentLimit) {
        return { status: "limit_reached" as const };
      }
      const rawKey = `djay_flow_${createOpaqueToken()}`; const deploymentId = randomUUID();
      await sql`INSERT INTO tenancy.flow_deployments (id, tenant_id, bot_id, name, deployment_key_hash, key_prefix, allowed_origins, created_by_membership_id) VALUES (${deploymentId}::uuid, ${context.tenantId}::uuid, ${botId}::uuid, ${input.name}, ${hashOpaqueToken(rawKey)}, ${rawKey.slice(0, 16)}, ${origins as string[]}, ${context.membershipId}::uuid)`;
      return { status: "created" as const, deploymentId, deploymentKey: rawKey };
    });
  }

  async listDeployments(context: TenantContext, botId: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{ id: string; name: string; keyPrefix: string; status: string; allowedOrigins: string[]; createdAt: Date }[]>`
      SELECT id, name, key_prefix AS "keyPrefix", status, allowed_origins AS "allowedOrigins", created_at AS "createdAt"
      FROM tenancy.flow_deployments WHERE tenant_id = ${context.tenantId}::uuid AND bot_id = ${botId}::uuid ORDER BY created_at DESC
    `);
  }

  async requestInstallCheck(context: TenantContext, deploymentId: string, targetOrigin: string) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active") return { status: "not_entitled" as const };
      const deployments = await sql<{ allowed_origins: string[] }[]>`
        SELECT allowed_origins FROM tenancy.flow_deployments
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${deploymentId}::uuid AND status = 'active'
      `;
      if (!deployments[0]?.allowed_origins.includes(targetOrigin)) return { status: "not_found" as const };
      const checkId = randomUUID();
      await sql`
        INSERT INTO tenancy.flow_install_checks (
          id, tenant_id, deployment_id, requested_by_membership_id, target_origin, status
        ) VALUES (
          ${checkId}::uuid, ${context.tenantId}::uuid, ${deploymentId}::uuid,
          ${context.membershipId}::uuid, ${targetOrigin}, 'requested'
        )
      `;
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
      FROM tenancy.flow_install_checks
      WHERE tenant_id = ${context.tenantId}::uuid
        AND (${deploymentId ?? null}::uuid IS NULL OR deployment_id = ${deploymentId ?? null}::uuid)
      ORDER BY created_at DESC LIMIT 200
    `);
  }

  async analytics(context: TenantContext, days = 30) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority) return null;
      const summary = await sql<{
        executions: number; completed: number; handovers: number; leads: number; messages: number;
      }[]>`
        SELECT
          (SELECT count(*)::int FROM tenancy.flow_executions WHERE tenant_id = ${context.tenantId}::uuid AND started_at >= now() - make_interval(days => ${days})) AS executions,
          (SELECT count(*)::int FROM tenancy.flow_executions WHERE tenant_id = ${context.tenantId}::uuid AND status = 'completed' AND started_at >= now() - make_interval(days => ${days})) AS completed,
          (SELECT count(*)::int FROM tenancy.handover_events WHERE tenant_id = ${context.tenantId}::uuid AND event_type = 'requested' AND created_at >= now() - make_interval(days => ${days})) AS handovers,
          (SELECT count(*)::int FROM tenancy.leads WHERE tenant_id = ${context.tenantId}::uuid AND source = 'flowbot_web' AND created_at >= now() - make_interval(days => ${days})) AS leads,
          (SELECT count(*)::int FROM tenancy.messages message JOIN tenancy.conversations conversation
            ON conversation.tenant_id = message.tenant_id AND conversation.id = message.conversation_id
            WHERE message.tenant_id = ${context.tenantId}::uuid AND conversation.product_key = 'flowbot'
              AND message.created_at >= now() - make_interval(days => ${days})) AS messages
      `;
      const advanced = authority.entitlements["analytics.level"] === "advanced";
      const nodeEvents = advanced ? await sql<{ eventType: string; eventCount: number }[]>`
        SELECT event_type AS "eventType", count(*)::int AS "eventCount"
        FROM tenancy.flow_events
        WHERE tenant_id = ${context.tenantId}::uuid AND occurred_at >= now() - make_interval(days => ${days})
        GROUP BY event_type ORDER BY count(*) DESC, event_type LIMIT 100
      ` : [];
      const unansweredInputs = advanced ? await sql<{
        executionId: string; conversationId: string; contactName: string; reason: string;
        inputText: string | null; occurredAt: Date;
      }[]>`
        SELECT event.execution_id AS "executionId", execution.conversation_id AS "conversationId",
               contact.display_name AS "contactName", event.detail_json->>'reason' AS reason,
               inbound.content_json->>'text' AS "inputText", event.occurred_at AS "occurredAt"
        FROM tenancy.flow_events event
        JOIN tenancy.flow_executions execution ON execution.tenant_id = event.tenant_id AND execution.id = event.execution_id
        JOIN tenancy.conversations conversation ON conversation.tenant_id = execution.tenant_id AND conversation.id = execution.conversation_id
        JOIN tenancy.contacts contact ON contact.tenant_id = conversation.tenant_id AND contact.id = conversation.contact_id
        LEFT JOIN LATERAL (
          SELECT message.content_json FROM tenancy.messages message
          WHERE message.tenant_id = conversation.tenant_id AND message.conversation_id = conversation.id
            AND message.direction = 'inbound' AND message.created_at <= event.occurred_at
          ORDER BY message.created_at DESC, message.sequence DESC LIMIT 1
        ) inbound ON true
        WHERE event.tenant_id = ${context.tenantId}::uuid
          AND event.occurred_at >= now() - make_interval(days => ${days})
          AND event.event_type = 'handover_requested'
          AND event.detail_json->>'reason' IN ('keyword_miss', 'ambiguous_keyword')
        ORDER BY event.occurred_at DESC, event.id DESC LIMIT 200
      ` : [];
      const journeys = advanced ? await sql<{ path: string; executions: number; completed: number; handovers: number }[]>`
        WITH execution_paths AS (
          SELECT execution.id,
                 string_agg(COALESCE(event.detail_json->>'nodeType', 'unknown'), ' > ' ORDER BY event.occurred_at, event.id) AS path,
                 execution.status
          FROM tenancy.flow_executions execution
          JOIN tenancy.flow_events event ON event.tenant_id = execution.tenant_id AND event.execution_id = execution.id
            AND event.event_type = 'node_entered'
          WHERE execution.tenant_id = ${context.tenantId}::uuid
            AND execution.started_at >= now() - make_interval(days => ${days})
          GROUP BY execution.id
        )
        SELECT path, count(*)::int AS executions,
               count(*) FILTER (WHERE status = 'completed')::int AS completed,
               count(*) FILTER (WHERE status = 'handover')::int AS handovers
        FROM execution_paths WHERE path IS NOT NULL
        GROUP BY path ORDER BY count(*) DESC, path LIMIT 100
      ` : [];
      return { periodDays: days, level: advanced ? "advanced" as const : "core" as const, ...summary[0]!, nodeEvents, unansweredInputs, journeys };
    });
  }

  async downgradePreflight(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const destinationRows = await sql<{
        entitlements: Record<string, boolean | string | number | null>;
        limits: Record<string, number | null>;
      }[]>`
        SELECT version.entitlements, version.limits
        FROM catalog.plan_versions version
        JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE plan.plan_key = 'flowbot_basic' AND version.status = 'published'
          AND version.effective_from <= now()
          AND (version.effective_to IS NULL OR version.effective_to > now())
        ORDER BY version.version DESC LIMIT 1
      `;
      if (!destinationRows[0]) return null;
      const rows = await sql<{ snapshot_json: unknown }[]>`
        SELECT version.snapshot_json FROM tenancy.flow_bots bot
        JOIN tenancy.flow_versions version
          ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
        WHERE bot.tenant_id = ${context.tenantId}::uuid AND bot.status = 'active'
      `;
      const counts = await sql<{ active_bots: number; branding_removed: boolean; integrations: number }[]>`
        SELECT
          (SELECT count(*)::int FROM tenancy.flow_bots WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active') AS active_bots,
          EXISTS(SELECT 1 FROM tenancy.flow_bots WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active' AND branding_removed) AS branding_removed,
          (SELECT count(*)::int FROM tenancy.flow_integration_profiles WHERE tenant_id = ${context.tenantId}::uuid AND status = 'approved') AS integrations
      `;
      const destination: FlowEntitlements = {
        planKey: "flowbot_basic", accessMode: "active",
        entitlements: destinationRows[0].entitlements, limits: destinationRows[0].limits,
      };
      const state = counts[0]!;
      const blockers = flowbotDowngradeBlockers({
        snapshots: rows.map((row) => flowSnapshotSchema.parse(row.snapshot_json)),
        activeBotCount: state.active_bots,
        brandingRemoved: state.branding_removed,
        approvedIntegrationCount: state.integrations,
      }, destination);
      return {
        destinationPlanKey: "flowbot_basic" as const,
        allowed: blockers.length === 0,
        blockers,
        remediation: blockers.map((blocker) => ({
          blocker,
          action: blocker.code === "premium_node_present" ? "Replace or remove this Premium node in a new draft."
            : blocker.code === "active_bot_limit_exceeded" ? "Archive excess active bots."
              : blocker.code === "branding_dependency" ? "Restore platform branding."
                : "Disable approved webhook integrations and remove webhook nodes.",
        })),
      };
    });
  }

  async listBusinessSchedules(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; scheduleKey: string; name: string; timezone: string;
      weeklyWindows: unknown; closedDates: string[]; updatedAt: Date;
    }[]>`
      SELECT id, schedule_key AS "scheduleKey", name, timezone,
             weekly_windows AS "weeklyWindows", closed_dates AS "closedDates", updated_at AS "updatedAt"
      FROM tenancy.flow_business_schedules
      WHERE tenant_id = ${context.tenantId}::uuid ORDER BY schedule_key
    `);
  }

  async upsertBusinessSchedule(context: TenantContext, input: Readonly<{
    scheduleKey: string; name: string; timezone: string;
    weeklyWindows: readonly { dayOfWeek: number; startMinute: number; endMinute: number }[];
    closedDates?: readonly string[];
  }>) {
    const formError = flowbotScheduleFormError(input);
    if (formError) return { status: formError.field === "timezone" ? "invalid_timezone" as const : "validation_failed" as const };
    const parsed = flowBusinessScheduleSchema.safeParse({
      scheduleKey: input.scheduleKey, timezone: input.timezone,
      weeklyWindows: input.weeklyWindows, closedDates: input.closedDates ?? [],
    });
    if (!parsed.success) return { status: "validation_failed" as const };
    const schedule = parsed.data;
    const name = input.name.trim();
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["flow.business_hours"] !== true) {
        return { status: "not_entitled" as const };
      }
      const rows = await sql<{ id: string }[]>`
        INSERT INTO tenancy.flow_business_schedules (
          tenant_id, schedule_key, name, timezone, weekly_windows, closed_dates, created_by_membership_id
        ) VALUES (
          ${context.tenantId}::uuid, ${schedule.scheduleKey}, ${name}, ${schedule.timezone},
          ${sql.json(schedule.weeklyWindows)}, ${schedule.closedDates}, ${context.membershipId}::uuid
        )
        ON CONFLICT (tenant_id, schedule_key) DO UPDATE
        SET name = EXCLUDED.name, timezone = EXCLUDED.timezone,
            weekly_windows = EXCLUDED.weekly_windows, closed_dates = EXCLUDED.closed_dates, updated_at = now()
        RETURNING id
      `;
      return { status: "saved" as const, scheduleId: rows[0]!.id };
    });
  }

  async listRoutingTeams(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; teamKey: string; name: string; memberIds: string[];
    }[]>`
      SELECT team.id, team.team_key AS "teamKey", team.name,
             COALESCE(array_agg(member.membership_id ORDER BY member.membership_id)
               FILTER (WHERE member.membership_id IS NOT NULL), '{}') AS "memberIds"
      FROM tenancy.flow_routing_teams team
      LEFT JOIN tenancy.flow_routing_team_members member
        ON member.tenant_id = team.tenant_id AND member.team_id = team.id
      WHERE team.tenant_id = ${context.tenantId}::uuid AND team.status = 'active'
      GROUP BY team.id ORDER BY team.team_key
    `);
  }

  async upsertRoutingTeam(context: TenantContext, input: Readonly<{
    teamKey: string; name: string; membershipIds: readonly string[];
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authority = await this.authority(sql, context.tenantId);
      if (!authority || authority.accessMode !== "active" || authority.entitlements["flow.team_routing"] !== true) {
        return { status: "not_entitled" as const };
      }
      const uniqueIds = [...new Set(input.membershipIds)];
      if (flowbotRoutingTeamFormError({ ...input, membershipIds: uniqueIds })
        || uniqueIds.some((membershipId) => !uuidSchema.safeParse(membershipId).success)) {
        return { status: "validation_failed" as const };
      }
      const teamKey = input.teamKey.trim(); const name = input.name.trim();
      const valid = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM tenancy.memberships
        WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active' AND id = ANY(${uniqueIds}::uuid[])
      `;
      if (valid[0]?.count !== uniqueIds.length) return { status: "validation_failed" as const };
      const teams = await sql<{ id: string }[]>`
        INSERT INTO tenancy.flow_routing_teams (tenant_id, team_key, name, created_by_membership_id)
        VALUES (${context.tenantId}::uuid, ${teamKey}, ${name}, ${context.membershipId}::uuid)
        ON CONFLICT (tenant_id, team_key) DO UPDATE SET name = EXCLUDED.name, status = 'active', updated_at = now()
        RETURNING id
      `;
      const teamId = teams[0]!.id;
      await sql`DELETE FROM tenancy.flow_routing_team_members WHERE tenant_id = ${context.tenantId}::uuid AND team_id = ${teamId}::uuid`;
      await sql`
        INSERT INTO tenancy.flow_routing_team_members (tenant_id, team_id, membership_id)
        SELECT ${context.tenantId}::uuid, ${teamId}::uuid, value::uuid FROM unnest(${uniqueIds}::text[]) AS value
      `;
      return { status: "saved" as const, teamId };
    });
  }
}
