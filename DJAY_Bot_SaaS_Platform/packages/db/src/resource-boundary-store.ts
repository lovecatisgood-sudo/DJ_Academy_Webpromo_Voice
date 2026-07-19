import { createHash, randomUUID } from "node:crypto";
import {
  evaluateResourceBoundaries, ResourceSelectionError, selectRetainedResources,
  type ContractResourceKey,
} from "@djay/entitlements";
import { flowbotDowngradeBlockers, flowSnapshotSchema, type FlowEntitlements } from "@djay/flowbot-domain";
import { publicPlanKeySchema, type ProductKey, type PublicPlanKey } from "@djay/shared";
import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

type ResourceItem = Readonly<{ id: string; name: string; kind: "bot" | "social_channel" }>;

export class TenantResourceBoundaryStore {
  constructor(private readonly client: DatabaseClient) {}

  async overview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const authorities = await sql<{
        subscriptionId: string; productKey: ProductKey; planKey: PublicPlanKey;
        limits: Record<string, number | null>; entitlements: Record<string, boolean | string | number | null>;
      }[]>`
        SELECT DISTINCT ON (subscription.product_key)
          subscription.id AS "subscriptionId", subscription.product_key AS "productKey",
          plan.plan_key AS "planKey", snapshot.resolved_json->'limits' AS limits,
          snapshot.resolved_json->'entitlements' AS entitlements
        FROM tenancy.product_subscriptions subscription
        JOIN tenancy.entitlement_snapshots snapshot
          ON snapshot.tenant_id = subscription.tenant_id AND snapshot.subscription_id = subscription.id
        JOIN catalog.plan_versions version ON version.id = snapshot.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE subscription.tenant_id = ${context.tenantId}::uuid
          AND subscription.status IN ('active', 'trialing', 'scheduled_change')
          AND snapshot.access_mode = 'active'
        ORDER BY subscription.product_key, snapshot.created_at DESC, snapshot.id DESC
      `;
      const [flowBots, aiBots, voiceBots, socialChannels, sharedCounts, seatRows, states] = await Promise.all([
        sql<ResourceItem[]>`
          SELECT id, name, 'bot'::text AS kind FROM tenancy.flow_bots
          WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'
          ORDER BY created_at, id
        `,
        sql<ResourceItem[]>`
          SELECT agent.id, agent.name, 'bot'::text AS kind FROM tenancy.ai_agents agent
          WHERE agent.tenant_id = ${context.tenantId}::uuid AND agent.status <> 'archived'
            AND NOT EXISTS (SELECT 1 FROM tenancy.voice_deployments voice
              WHERE voice.tenant_id = agent.tenant_id AND voice.agent_id = agent.id)
          ORDER BY agent.created_at, agent.id
        `,
        sql<ResourceItem[]>`
          SELECT id, name, 'bot'::text AS kind FROM tenancy.voice_deployments
          WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
          ORDER BY created_at, id
        `,
        sql<ResourceItem[]>`
          SELECT id, name, 'social_channel'::text AS kind FROM tenancy.ai_social_connections
          WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
          ORDER BY created_at, id
        `,
        sql<{ workspaces: number; knowledgeCollections: number; concurrentCalls: number }[]>`
          SELECT 1::int AS workspaces,
            (SELECT count(*)::int FROM tenancy.knowledge_sources
              WHERE tenant_id = ${context.tenantId}::uuid AND status = 'active') AS "knowledgeCollections",
            (SELECT count(*)::int FROM tenancy.voice_concurrency_leases
              WHERE tenant_id = ${context.tenantId}::uuid AND released_at IS NULL) AS "concurrentCalls"
        `,
        sql<{ allowed: boolean; seat_limit: number; occupied: number }[]>`
          SELECT * FROM tenancy.administrator_seat_capacity(true)
        `,
        sql<{ productKey: ProductKey; resourceKind: string; resourceId: string; state: string; reasonCode: string }[]>`
          SELECT product_key AS "productKey", resource_kind AS "resourceKind",
            resource_id AS "resourceId", state, reason_code AS "reasonCode"
          FROM tenancy.entitlement_resource_states
          WHERE tenant_id = ${context.tenantId}::uuid
          ORDER BY product_key, resource_kind, resource_id
        `,
      ]);
      const shared = sharedCounts[0] ?? { workspaces: 1, knowledgeCollections: 0, concurrentCalls: 0 };
      const seat = seatRows[0] ?? { allowed: false, seat_limit: 1, occupied: 0 };
      const resources: Readonly<Record<ProductKey, readonly ResourceItem[]>> = {
        flowbot: flowBots,
        ai_chat: [...aiBots, ...socialChannels],
        voice: voiceBots,
      };
      return {
        seatCapacity: { allowed: seat.allowed, limit: seat.seat_limit, occupied: seat.occupied },
        products: authorities.map((authority) => {
          const usage: Partial<Record<ContractResourceKey, number>> = {
            active_bots: authority.productKey === "flowbot" ? flowBots.length
              : authority.productKey === "ai_chat" ? aiBots.length : voiceBots.length,
            workspaces: shared.workspaces,
            seats: seat.occupied,
            ...(authority.productKey === "ai_chat" ? {
              social_channels: socialChannels.length,
              knowledge_collections: shared.knowledgeCollections,
            } : {}),
            ...(authority.productKey === "voice" ? {
              knowledge_collections: shared.knowledgeCollections,
              concurrent_calls: shared.concurrentCalls,
            } : {}),
          };
          return {
            ...authority,
            boundaries: evaluateResourceBoundaries(authority.limits, usage),
            resources: resources[authority.productKey],
          };
        }),
        resourceStates: states,
      };
    });
  }

  async downgradePreflight(context: TenantContext, input: Readonly<{
    subscriptionId: string; destinationPlanKey: PublicPlanKey; now?: Date;
  }>) {
    const destinationPlanKey = publicPlanKeySchema.parse(input.destinationPlanKey);
    const now = input.now ?? new Date();
    const overview = await this.overview(context);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.subscriptionId}:downgrade-preflight`}, 0))`;
      const plans = await sql<{
        subscriptionId: string; productKey: ProductKey; currentPlanKey: PublicPlanKey;
        currentTierRank: number; destinationPlanVersionId: string; destinationTierRank: number;
        destinationLimits: Record<string, number | null>;
        destinationEntitlements: Record<string, boolean | string | number | null>;
      }[]>`
        SELECT subscription.id AS "subscriptionId", subscription.product_key AS "productKey",
          current_plan.plan_key AS "currentPlanKey", current_plan.tier_rank AS "currentTierRank",
          destination_version.id AS "destinationPlanVersionId",
          destination_plan.tier_rank AS "destinationTierRank",
          destination_version.limits AS "destinationLimits",
          destination_version.entitlements AS "destinationEntitlements"
        FROM tenancy.product_subscriptions subscription
        JOIN catalog.plan_versions current_version ON current_version.id = subscription.plan_version_id
        JOIN catalog.plans current_plan ON current_plan.id = current_version.plan_id
        JOIN catalog.plans destination_plan
          ON destination_plan.product_key = subscription.product_key
          AND destination_plan.plan_key = ${destinationPlanKey}
          AND destination_plan.status = 'active'
        JOIN LATERAL (
          SELECT version.id, version.limits, version.entitlements
          FROM catalog.plan_versions version
          WHERE version.plan_id = destination_plan.id AND version.status = 'published'
            AND version.effective_from <= ${now}
            AND (version.effective_to IS NULL OR version.effective_to > ${now})
          ORDER BY version.version DESC LIMIT 1
        ) destination_version ON true
        WHERE subscription.tenant_id = ${context.tenantId}::uuid
          AND subscription.id = ${input.subscriptionId}::uuid
          AND subscription.status IN ('active', 'trialing')
      `;
      const plan = plans[0];
      if (!plan) return { status: "not_found" as const };
      if (plan.destinationTierRank >= plan.currentTierRank) {
        return { status: "not_a_downgrade" as const };
      }
      const product = overview.products.find((item) => item.subscriptionId === plan.subscriptionId);
      if (!product) return { status: "not_found" as const };
      const usage = Object.fromEntries(product.boundaries.map((item) => [item.key, item.used])) as Partial<Record<ContractResourceKey, number>>;
      usage.active_bots = product.resources.filter((item) => item.kind === "bot").length;
      usage.social_channels = product.resources.filter((item) => item.kind === "social_channel").length;
      usage.workspaces = 1;
      usage.seats = overview.seatCapacity.occupied;
      const boundaries = evaluateResourceBoundaries(plan.destinationLimits, usage);
      const blockers: Array<Readonly<{ code: string; resourceKey?: string; excess?: number; detail?: string }>> = boundaries
        .filter((item) => item.excess > 0)
        .map((item) => ({ code: "resource_limit_exceeded", resourceKey: item.key, excess: item.excess }));

      if (plan.productKey === "flowbot") {
        const snapshots = await sql<{ snapshot: unknown }[]>`
          SELECT version.snapshot_json AS snapshot FROM tenancy.flow_bots bot
          JOIN tenancy.flow_versions version
            ON version.tenant_id = bot.tenant_id AND version.id = bot.current_published_version_id
          WHERE bot.tenant_id = ${context.tenantId}::uuid AND bot.status = 'active'
        `;
        const dependencies = await sql<{ brandingRemoved: boolean; integrations: number }[]>`
          SELECT
            EXISTS(SELECT 1 FROM tenancy.flow_bots WHERE tenant_id = ${context.tenantId}::uuid
              AND status = 'active' AND branding_removed) AS "brandingRemoved",
            (SELECT count(*)::int FROM tenancy.flow_integration_profiles
              WHERE tenant_id = ${context.tenantId}::uuid AND status = 'approved') AS integrations
        `;
        const destination: FlowEntitlements = {
          planKey: "flowbot_basic", accessMode: "active",
          entitlements: plan.destinationEntitlements, limits: plan.destinationLimits,
        };
        for (const blocker of flowbotDowngradeBlockers({
          snapshots: snapshots.map((item) => flowSnapshotSchema.parse(item.snapshot)),
          activeBotCount: usage.active_bots,
          brandingRemoved: dependencies[0]?.brandingRemoved ?? false,
          approvedIntegrationCount: dependencies[0]?.integrations ?? 0,
        }, destination)) {
          if (!blockers.some((item) => item.code === blocker.code)) blockers.push(blocker);
        }
      }
      if (plan.productKey === "voice"
        && plan.destinationEntitlements["voice.capability_profile"] === "voice_gen1") {
        const advanced = await sql<{ count: number }[]>`
          SELECT count(*)::int AS count FROM tenancy.voice_deployments
          WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
            AND capability_profile = 'voice_gen2'
        `;
        if ((advanced[0]?.count ?? 0) > 0) blockers.push({
          code: "capability_profile_change_required",
          detail: `${advanced[0]!.count} Advanced Voice deployment(s) require replacement or disablement.`,
        });
      }

      const requiredSelection = {
        active_bots: product.resources.filter((item) => item.kind === "bot"),
        social_channels: product.resources.filter((item) => item.kind === "social_channel"),
      };
      const evidenceId = randomUUID();
      const evidence = {
        productKey: plan.productKey, currentPlanKey: plan.currentPlanKey,
        destinationPlanKey, currentResourceCounts: usage,
        destinationLimits: plan.destinationLimits, blockers, requiredSelection,
      };
      const contentHash = createHash("sha256").update(JSON.stringify(evidence)).digest();
      await sql`
        INSERT INTO tenancy.downgrade_preflight_evidence (
          id, tenant_id, subscription_id, destination_plan_version_id,
          current_resource_counts, destination_limits, blockers,
          required_selection, content_hash, evaluated_at, expires_at
        ) VALUES (
          ${evidenceId}::uuid, ${context.tenantId}::uuid, ${plan.subscriptionId}::uuid,
          ${plan.destinationPlanVersionId}::uuid, ${sql.json(usage)},
          ${sql.json(plan.destinationLimits)}, ${sql.json(blockers)},
          ${sql.json(requiredSelection)}, ${contentHash}, ${now}, ${new Date(now.getTime() + 15 * 60_000)}
        )
      `;
      return {
        status: "evaluated" as const, evidenceId, expiresAt: new Date(now.getTime() + 15 * 60_000),
        productKey: plan.productKey, currentPlanKey: plan.currentPlanKey,
        destinationPlanKey, allowed: blockers.length === 0, boundaries, blockers, requiredSelection,
      };
    });
  }

  async scheduleDowngrade(context: TenantContext, input: Readonly<{
    evidenceId: string;
    retainedActiveBotIds: readonly string[];
    retainedSocialChannelIds: readonly string[];
    now?: Date;
  }>) {
    const now = input.now ?? new Date();
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const evidenceRows = await sql<{
        subscriptionId: string; destinationPlanVersionId: string; destinationLimits: Record<string, number | null>;
        blockers: Array<{ code: string; resourceKey?: string }>; requiredSelection: {
          active_bots?: ResourceItem[]; social_channels?: ResourceItem[];
        }; expiresAt: Date; fromPlanVersionId: string; periodEnd: Date | null; productKey: ProductKey;
      }[]>`
        SELECT evidence.subscription_id AS "subscriptionId",
          evidence.destination_plan_version_id AS "destinationPlanVersionId",
          evidence.destination_limits AS "destinationLimits", evidence.blockers,
          evidence.required_selection AS "requiredSelection", evidence.expires_at AS "expiresAt",
          subscription.plan_version_id AS "fromPlanVersionId", subscription.period_end AS "periodEnd",
          subscription.product_key AS "productKey"
        FROM tenancy.downgrade_preflight_evidence evidence
        JOIN tenancy.product_subscriptions subscription
          ON subscription.tenant_id = evidence.tenant_id AND subscription.id = evidence.subscription_id
        WHERE evidence.tenant_id = ${context.tenantId}::uuid AND evidence.id = ${input.evidenceId}::uuid
          AND subscription.status IN ('active', 'trialing')
        FOR UPDATE OF subscription
      `;
      const evidence = evidenceRows[0];
      if (!evidence) return { status: "not_found" as const };
      if (evidence.expiresAt <= now) return { status: "preflight_expired" as const };
      if (!evidence.periodEnd || evidence.periodEnd <= now) return { status: "billing_period_unavailable" as const };

      const hardBlockers = evidence.blockers.filter((blocker) => blocker.code !== "resource_limit_exceeded"
        && blocker.code !== "active_bot_limit_exceeded");
      const unsupportedExcess = evidence.blockers.filter((blocker) => blocker.code === "resource_limit_exceeded"
        && blocker.resourceKey !== "active_bots" && blocker.resourceKey !== "social_channels");
      if (hardBlockers.length || unsupportedExcess.length) {
        return { status: "blocked" as const, blockers: [...hardBlockers, ...unsupportedExcess] };
      }

      const expectedBots = evidence.requiredSelection.active_bots ?? [];
      const expectedSocial = evidence.requiredSelection.social_channels ?? [];
      const currentRows = await sql<{ id: string; kind: "bot" | "social_channel" }[]>`
        SELECT id, 'bot'::text AS kind FROM tenancy.flow_bots
          WHERE ${evidence.productKey} = 'flowbot' AND tenant_id = ${context.tenantId}::uuid AND status <> 'archived'
        UNION ALL SELECT agent.id, 'bot'::text AS kind FROM tenancy.ai_agents agent
          WHERE ${evidence.productKey} = 'ai_chat' AND agent.tenant_id = ${context.tenantId}::uuid
            AND agent.status <> 'archived' AND NOT EXISTS (
              SELECT 1 FROM tenancy.voice_deployments voice
              WHERE voice.tenant_id = agent.tenant_id AND voice.agent_id = agent.id)
        UNION ALL SELECT deployment.id, 'bot'::text AS kind FROM tenancy.voice_deployments deployment
          WHERE ${evidence.productKey} = 'voice' AND deployment.tenant_id = ${context.tenantId}::uuid
            AND deployment.status <> 'revoked'
        UNION ALL SELECT id, 'social_channel'::text AS kind FROM tenancy.ai_social_connections
          WHERE ${evidence.productKey} = 'ai_chat' AND tenant_id = ${context.tenantId}::uuid AND status <> 'revoked'
      `;
      const currentBots = currentRows.filter((item) => item.kind === "bot").map((item) => item.id).sort();
      const currentSocial = currentRows.filter((item) => item.kind === "social_channel").map((item) => item.id).sort();
      if (JSON.stringify(currentBots) !== JSON.stringify(expectedBots.map((item) => item.id).sort())
        || JSON.stringify(currentSocial) !== JSON.stringify(expectedSocial.map((item) => item.id).sort())) {
        return { status: "resources_changed" as const };
      }

      try {
        const bots = selectRetainedResources(currentBots, evidence.destinationLimits.active_bots, input.retainedActiveBotIds);
        const social = selectRetainedResources(currentSocial, evidence.destinationLimits.social_channels, input.retainedSocialChannelIds);
        const resourceKind = evidence.productKey === "voice" ? "deployment" : "bot";
        const retainedResourceSelection = {
          retainedActiveBotIds: bots.retained,
          retainedSocialChannelIds: social.retained,
          excessResources: [
            ...bots.excess.map((resourceId) => ({ resourceId, resourceKind, state: "read_only_excess" })),
            ...social.excess.map((resourceId) => ({ resourceId, resourceKind: "social_channel", state: "disabled_excess" })),
          ],
        };
        const changeId = randomUUID();
        await sql`
          INSERT INTO tenancy.subscription_scheduled_changes (
            id, tenant_id, subscription_id, from_plan_version_id, to_plan_version_id,
            effective_at, retained_resource_selection, status, requested_by_user_id,
            requested_by_membership_id, request_id
          ) VALUES (
            ${changeId}::uuid, ${context.tenantId}::uuid, ${evidence.subscriptionId}::uuid,
            ${evidence.fromPlanVersionId}::uuid, ${evidence.destinationPlanVersionId}::uuid,
            ${evidence.periodEnd}, ${sql.json(retainedResourceSelection)}, 'scheduled',
            ${context.userId}::uuid, ${context.membershipId}::uuid, ${context.requestId}
          )
        `;
        await sql`
          UPDATE tenancy.product_subscriptions SET status = 'scheduled_change', updated_at = ${now}
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${evidence.subscriptionId}::uuid
        `;
        await sql`
          INSERT INTO tenancy.audit_logs (
            tenant_id, actor_user_id, actor_membership_id, action, target_type,
            target_id, request_id, result, metadata
          ) VALUES (
            ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
            'subscription.plan_change_scheduled', 'subscription', ${evidence.subscriptionId},
            ${context.requestId}, 'succeeded', ${sql.json({ changeId, evidenceId: input.evidenceId,
              effectiveAt: evidence.periodEnd, destinationPlanVersionId: evidence.destinationPlanVersionId,
              retainedResourceSelection })}
          )
        `;
        return { status: "scheduled" as const, changeId, effectiveAt: evidence.periodEnd, retainedResourceSelection };
      } catch (error) {
        if (error instanceof ResourceSelectionError) return {
          status: "invalid_selection" as const,
          requiredCount: error.requiredCount, availableCount: error.availableCount,
        };
        throw error;
      }
    });
  }
}

export class EntitlementChangeWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async applyNext(now = new Date()) {
    const rows = await this.client<{ changeId: string; tenantId: string; subscriptionId: string; result: string }[]>`
      SELECT change_id AS "changeId", tenant_id AS "tenantId",
        subscription_id AS "subscriptionId", result
      FROM tenancy.apply_next_scheduled_entitlement_change(${now})
    `;
    return rows[0] ?? null;
  }
}
