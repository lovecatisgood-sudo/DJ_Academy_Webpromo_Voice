import { randomUUID } from "node:crypto";
import type { PlatformContext, TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction, withTenantTransaction } from "./scoped-transaction";

export type AddOnKey = "additional_administrator" | "additional_workspace" | "additional_social_channel" | "starter_branding_removal";
export type ServiceKind = "flow_starter_setup" | "flow_advanced_design" | "flow_complex_automation" | "knowledge_base_setup" | "ai_sales_configuration" | "ai_advanced_sales_system" | "voice_agent_setup" | "telephone_integration" | "custom_voice_automation" | "enterprise";
export type EngagementStatus = "awaiting_customer" | "scheduled" | "in_progress" | "review" | "completed" | "cancelled";
export type NextActionOwner = "customer" | "djai" | "shared";

export class TenantSharedSaasOperationsStore {
  constructor(private readonly client: DatabaseClient) {}
  async overview(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const addOns = await sql<{ id: string; addOnKey: AddOnKey; quantity: number; status: string; createdAt: Date }[]>`
        SELECT id, add_on_key AS "addOnKey", quantity, status, created_at AS "createdAt" FROM tenancy.add_on_requests
        WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at DESC`;
      const activeAddOns = await sql<{ addOnKey: AddOnKey; quantity: number; status: string }[]>`
        SELECT add_on_key AS "addOnKey", quantity, status FROM tenancy.subscription_add_ons WHERE tenant_id = ${context.tenantId}::uuid
          AND status IN ('active','scheduled_end') AND effective_from <= now() AND (effective_until IS NULL OR effective_until > now())`;
      const serviceRequests = await sql<{ id: string; serviceKind: ServiceKind; productKey: string | null; status: string; createdAt: Date }[]>`
        SELECT id, service_kind AS "serviceKind", product_key AS "productKey", status, created_at AS "createdAt"
        FROM tenancy.service_requests WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at DESC`;
      const engagements = await sql<{ id: string; serviceRequestId: string; title: string; scopeText: string; status: EngagementStatus; nextActionOwner: NextActionOwner; targetAt: Date | null; updatedAt: Date }[]>`
        SELECT id, service_request_id AS "serviceRequestId", title, scope_text AS "scopeText", status,
          next_action_owner AS "nextActionOwner", target_at AS "targetAt", updated_at AS "updatedAt"
        FROM tenancy.service_engagements WHERE tenant_id = ${context.tenantId}::uuid ORDER BY updated_at DESC`;
      const engagementUpdates = await sql<{ id: string; engagementId: string; authorKind: "customer" | "djai"; body: string; nextActionOwner: NextActionOwner | null; createdAt: Date }[]>`
        SELECT id, engagement_id AS "engagementId", author_kind AS "authorKind", body,
          next_action_owner AS "nextActionOwner", created_at AS "createdAt"
        FROM tenancy.service_engagement_updates WHERE tenant_id = ${context.tenantId}::uuid ORDER BY created_at`;
      const tutorials = await sql<{ tutorialKey: string; status: string; lastStepKey: string | null; updatedAt: Date }[]>`
        SELECT tutorial_key AS "tutorialKey", status, last_step_key AS "lastStepKey", updated_at AS "updatedAt"
        FROM tenancy.tutorial_progress WHERE tenant_id = ${context.tenantId}::uuid AND membership_id = ${context.membershipId}::uuid ORDER BY updated_at DESC`;
      return { addOns, activeAddOns, serviceRequests, engagements, engagementUpdates, tutorials };
    });
  }
  async requestAddOn(context: TenantContext, input: Readonly<{ subscriptionId?: string; addOnKey: AddOnKey; quantity: number; requestedScope: Record<string, unknown>; idempotencyKey: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      if (input.addOnKey !== "additional_workspace" && !input.subscriptionId) return { status: "subscription_required" as const };
      if ((input.addOnKey === "additional_workspace" || input.addOnKey === "starter_branding_removal") && input.quantity !== 1) {
        return { status: "invalid_quantity" as const };
      }
      if (input.subscriptionId) {
        const rows = await sql<{ productKey: string; planKey: string }[]>`
          SELECT subscription.product_key AS "productKey", plan.plan_key AS "planKey"
          FROM tenancy.product_subscriptions subscription
          JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
          JOIN catalog.plans plan ON plan.id = version.plan_id
          WHERE subscription.tenant_id = ${context.tenantId}::uuid AND subscription.id = ${input.subscriptionId}::uuid
            AND subscription.status IN ('active','trialing','scheduled_change')`;
        const contract = rows[0];
        if (!contract) return { status: "not_found" as const };
        if (input.addOnKey === "additional_social_channel" && !["flowbot", "ai_chat"].includes(contract.productKey)) {
          return { status: "add_on_not_eligible" as const };
        }
        if (input.addOnKey === "starter_branding_removal" && !["flowbot_basic", "ai_chat_basic", "voice_basic_gen1"].includes(contract.planKey)) {
          return { status: "add_on_not_eligible" as const };
        }
      }
      const id = randomUUID();
      const inserted = await sql<{ id: string }[]>`INSERT INTO tenancy.add_on_requests (id, tenant_id, subscription_id, add_on_key, quantity, requested_scope, requested_by_membership_id, idempotency_key)
        VALUES (${id}::uuid, ${context.tenantId}::uuid, ${input.subscriptionId ?? null}::uuid, ${input.addOnKey}, ${input.quantity},
          ${sql.json(input.requestedScope as never)}, ${context.membershipId}::uuid, ${input.idempotencyKey})
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`;
      if (inserted[0]) return { status: "requested" as const, requestId: inserted[0].id };
      const existing = await sql<{ id: string; subscriptionId: string | null; addOnKey: AddOnKey; quantity: number; requestedScope: Record<string, unknown> }[]>`
        SELECT id, subscription_id AS "subscriptionId", add_on_key AS "addOnKey", quantity, requested_scope AS "requestedScope"
        FROM tenancy.add_on_requests WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`;
      const same = existing[0] && existing[0].subscriptionId === (input.subscriptionId ?? null)
        && existing[0].addOnKey === input.addOnKey && existing[0].quantity === input.quantity
        && JSON.stringify(existing[0].requestedScope) === JSON.stringify(input.requestedScope);
      return same ? { status: "requested" as const, requestId: existing[0]!.id, replayed: true as const }
        : { status: "idempotency_conflict" as const };
    });
  }
  async requestService(context: TenantContext, input: Readonly<{ serviceKind: ServiceKind; productKey?: "flowbot" | "ai_chat" | "voice"; brief: string; idempotencyKey: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const id = randomUUID();
      const inserted = await sql<{ id: string }[]>`INSERT INTO tenancy.service_requests
        (id, tenant_id, service_kind, product_key, brief, requested_by_membership_id, idempotency_key)
        VALUES (${id}::uuid, ${context.tenantId}::uuid, ${input.serviceKind}, ${input.productKey ?? null}, ${input.brief},
          ${context.membershipId}::uuid, ${input.idempotencyKey})
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`;
      if (inserted[0]) return { status: "requested" as const, serviceRequestId: inserted[0].id };
      const existing = await sql<{ id: string; matches: boolean }[]>`
        SELECT id, service_kind = ${input.serviceKind} AND product_key IS NOT DISTINCT FROM ${input.productKey ?? null}
          AND brief = ${input.brief} AS matches
        FROM tenancy.service_requests WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`;
      return existing[0]?.matches
        ? { status: "requested" as const, serviceRequestId: existing[0].id, replayed: true as const }
        : { status: "idempotency_conflict" as const };
    });
  }
  async addEngagementUpdate(context: TenantContext, input: Readonly<{ engagementId: string; body: string; idempotencyKey: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const replay = await sql<{ id: string; matches: boolean }[]>`SELECT id, engagement_id = ${input.engagementId}::uuid
        AND author_kind = 'customer' AND body = ${input.body} AS matches FROM tenancy.service_engagement_updates
        WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`;
      if (replay[0]) return replay[0].matches ? { status: "updated" as const, updateId: replay[0].id, replayed: true as const }
        : { status: "idempotency_conflict" as const };
      const engagements = await sql<{ status: EngagementStatus }[]>`SELECT status FROM tenancy.service_engagements
        WHERE tenant_id = ${context.tenantId}::uuid AND id = ${input.engagementId}::uuid`;
      if (!engagements[0]) return { status: "not_found" as const };
      if (["completed", "cancelled"].includes(engagements[0].status)) return { status: "engagement_closed" as const };
      const id = randomUUID();
      const inserted = await sql<{ id: string }[]>`INSERT INTO tenancy.service_engagement_updates
        (id, tenant_id, engagement_id, author_kind, body, next_action_owner, idempotency_key)
        VALUES (${id}::uuid, ${context.tenantId}::uuid, ${input.engagementId}::uuid, 'customer', ${input.body}, 'djai', ${input.idempotencyKey})
        ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`;
      if (!inserted[0]) {
        const existing = await sql<{ id: string; matches: boolean }[]>`SELECT id, engagement_id = ${input.engagementId}::uuid
          AND author_kind = 'customer' AND body = ${input.body} AS matches FROM tenancy.service_engagement_updates
          WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`;
        return existing[0]?.matches ? { status: "updated" as const, updateId: existing[0].id, replayed: true as const }
          : { status: "idempotency_conflict" as const };
      }
      return { status: "updated" as const, updateId: inserted[0].id };
    });
  }
  async updateTutorial(context: TenantContext, input: Readonly<{ tutorialKey: string; status: "started" | "completed" | "dismissed"; lastStepKey?: string }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      await sql`INSERT INTO tenancy.tutorial_progress (tenant_id, membership_id, tutorial_key, status, last_step_key, completed_at)
        VALUES (${context.tenantId}::uuid, ${context.membershipId}::uuid, ${input.tutorialKey}, ${input.status}, ${input.lastStepKey ?? null},
          ${input.status === "completed" ? new Date() : null}) ON CONFLICT (tenant_id, membership_id, tutorial_key) DO UPDATE SET status = EXCLUDED.status,
          last_step_key = EXCLUDED.last_step_key, completed_at = EXCLUDED.completed_at, updated_at = now()`;
      return { status: "updated" as const };
    });
  }
}

export class PlatformSharedSaasOperationsStore {
  constructor(private readonly client: DatabaseClient) {}
  async queue(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => ({
      addOns: await sql<{ id: string; tenantId: string; businessName: string; addOnKey: AddOnKey; quantity: number; status: string; createdAt: Date }[]>`
        SELECT request.id, request.tenant_id AS "tenantId", tenant.business_name AS "businessName",
          request.add_on_key AS "addOnKey", request.quantity, request.status, request.created_at AS "createdAt"
        FROM tenancy.add_on_requests request JOIN tenancy.tenants tenant ON tenant.id = request.tenant_id
        WHERE request.status IN ('requested','quoted','approved') ORDER BY request.created_at LIMIT 500`,
      services: await sql<{ id: string; tenantId: string; businessName: string; serviceKind: ServiceKind; productKey: string | null; status: string; createdAt: Date }[]>`
        SELECT request.id, request.tenant_id AS "tenantId", tenant.business_name AS "businessName",
          request.service_kind AS "serviceKind", request.product_key AS "productKey", request.status,
          request.created_at AS "createdAt"
        FROM tenancy.service_requests request JOIN tenancy.tenants tenant ON tenant.id = request.tenant_id
        WHERE request.status NOT IN ('declined','cancelled','engaged') ORDER BY request.created_at LIMIT 500`,
      engagements: await sql<{ id: string; tenantId: string; businessName: string; serviceRequestId: string; title: string; scopeText: string; status: EngagementStatus; nextActionOwner: NextActionOwner; targetAt: Date | null; updatedAt: Date }[]>`
        SELECT engagement.id, engagement.tenant_id AS "tenantId", tenant.business_name AS "businessName",
          engagement.service_request_id AS "serviceRequestId", engagement.title, engagement.scope_text AS "scopeText",
          engagement.status, engagement.next_action_owner AS "nextActionOwner", engagement.target_at AS "targetAt",
          engagement.updated_at AS "updatedAt"
        FROM tenancy.service_engagements engagement JOIN tenancy.tenants tenant ON tenant.id = engagement.tenant_id
        WHERE engagement.status NOT IN ('completed','cancelled') ORDER BY engagement.updated_at LIMIT 500`,
    }));
  }
  async provisionAddOn(context: PlatformContext, requestId: string) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ tenantId: string; subscriptionId: string | null; addOnKey: AddOnKey; quantity: number; requestedScope: Record<string, unknown>; requestedByMembershipId: string }[]>`
        SELECT tenant_id AS "tenantId", subscription_id AS "subscriptionId", add_on_key AS "addOnKey", quantity,
          requested_scope AS "requestedScope", requested_by_membership_id AS "requestedByMembershipId" FROM tenancy.add_on_requests
        WHERE id = ${requestId}::uuid AND status IN ('requested','quoted','approved') FOR UPDATE`;
      const request = rows[0];
      if (!request) return { status: "request_not_available" as const };
      if (request.addOnKey === "additional_workspace") {
        const businessName = typeof request.requestedScope.businessName === "string" ? request.requestedScope.businessName.trim() : "";
        const slug = typeof request.requestedScope.slug === "string" ? request.requestedScope.slug.trim().toLowerCase() : "";
        if (businessName.length < 2 || businessName.length > 200 || !/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
          return { status: "workspace_scope_invalid" as const };
        }
        const collisions = await sql<{ exists: boolean }[]>`SELECT EXISTS(SELECT 1 FROM tenancy.tenants WHERE slug = ${slug}) AS exists`;
        if (collisions[0]?.exists) return { status: "workspace_slug_unavailable" as const };
        const owners = await sql<{ userId: string; locale: string }[]>`
          SELECT user_id AS "userId", locale FROM tenancy.workspace_add_on_owner_context(${requestId}::uuid)`;
        if (!owners[0]) return { status: "workspace_owner_unavailable" as const };
        const provisionedTenantId = randomUUID(); const ownerMembershipId = randomUUID();
        await sql`INSERT INTO tenancy.tenants (id, slug, business_name, status, locale, timezone)
          VALUES (${provisionedTenantId}::uuid, ${slug}, ${businessName}, 'active', ${owners[0].locale}, 'Asia/Bangkok')`;
        await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
          VALUES (${ownerMembershipId}::uuid, ${provisionedTenantId}::uuid, ${owners[0].userId}::uuid, 'tenant_master_admin', 'active', now())`;
        await sql`INSERT INTO tenancy.tenant_onboarding (tenant_id, stage) VALUES (${provisionedTenantId}::uuid, 'account_created')`;
        await sql`INSERT INTO tenancy.workspace_add_on_provisions (source_tenant_id, add_on_request_id, provisioned_tenant_id, owner_membership_id, provisioned_by_platform_user_id)
          VALUES (${request.tenantId}::uuid, ${requestId}::uuid, ${provisionedTenantId}::uuid, ${ownerMembershipId}::uuid, ${context.platformUserId}::uuid)`;
        await sql`UPDATE tenancy.add_on_requests SET status = 'provisioned', assigned_platform_user_id = ${context.platformUserId}::uuid,
          completed_at = now(), updated_at = now() WHERE id = ${requestId}::uuid`;
        await sql`INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
          VALUES (${context.platformUserId}::uuid, 'saas_workspace.provisioned', 'tenant', ${provisionedTenantId}, ${context.requestId}, 'succeeded',
            ${sql.json({ sourceTenantId: request.tenantId, addOnRequestId: requestId, ownerUserId: owners[0].userId })})`;
        return { status: "provisioned" as const, provisionedTenantId };
      }
      if (!request.subscriptionId) return { status: "subscription_required" as const };
      await sql`INSERT INTO tenancy.subscription_add_ons (tenant_id, subscription_id, add_on_key, quantity, status, effective_from)
        VALUES (${request.tenantId}::uuid, ${request.subscriptionId}::uuid, ${request.addOnKey}, ${request.quantity}, 'active', now())
        ON CONFLICT (tenant_id, subscription_id, add_on_key) DO UPDATE SET
          quantity = tenancy.subscription_add_ons.quantity + EXCLUDED.quantity,
          status = 'active', effective_from = now(), effective_until = NULL, updated_at = now()`;
      await sql`UPDATE tenancy.add_on_requests SET status = 'provisioned', assigned_platform_user_id = ${context.platformUserId}::uuid,
        completed_at = now(), updated_at = now() WHERE id = ${requestId}::uuid`;
      await sql`INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.platformUserId}::uuid, 'saas_add_on.provisioned', 'add_on_request', ${requestId}, ${context.requestId},
          'succeeded', ${sql.json({ tenantId: request.tenantId, subscriptionId: request.subscriptionId, addOnKey: request.addOnKey, quantity: request.quantity })})`;
      return { status: "provisioned" as const };
    });
  }
  async createEngagement(context: PlatformContext, input: Readonly<{ serviceRequestId: string; title: string; scope: string; nextActionOwner: "customer" | "djai" | "shared"; targetAt?: Date }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const id = randomUUID();
      const rows = await sql<{ tenantId: string }[]>`UPDATE tenancy.service_requests SET status = 'engaged', assigned_platform_user_id = ${context.platformUserId}::uuid,
        updated_at = now() WHERE id = ${input.serviceRequestId}::uuid AND status IN ('requested','qualifying','quoted','accepted') RETURNING tenant_id AS "tenantId"`;
      if (!rows[0]) return { status: "not_engageable" as const };
      await sql`INSERT INTO tenancy.service_engagements (id, tenant_id, service_request_id, title, scope_text, next_action_owner, target_at, platform_owner_user_id)
        VALUES (${id}::uuid, ${rows[0].tenantId}::uuid, ${input.serviceRequestId}::uuid, ${input.title}, ${input.scope}, ${input.nextActionOwner},
          ${input.targetAt ?? null}, ${context.platformUserId}::uuid)`;
      await sql`INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.platformUserId}::uuid, 'saas_service.engaged', 'service_engagement', ${id}, ${context.requestId},
          'succeeded', ${sql.json({ tenantId: rows[0].tenantId, serviceRequestId: input.serviceRequestId, nextActionOwner: input.nextActionOwner })})`;
      return { status: "created" as const, engagementId: id };
    });
  }
  async updateEngagement(context: PlatformContext, input: Readonly<{ engagementId: string; status: EngagementStatus; nextActionOwner: NextActionOwner; body: string; idempotencyKey: string }>) {
    const transitions: Record<EngagementStatus, readonly EngagementStatus[]> = {
      awaiting_customer: ["awaiting_customer", "scheduled", "in_progress", "cancelled"],
      scheduled: ["scheduled", "awaiting_customer", "in_progress", "cancelled"],
      in_progress: ["in_progress", "awaiting_customer", "review", "cancelled"],
      review: ["review", "in_progress", "awaiting_customer", "completed", "cancelled"],
      completed: [], cancelled: [],
    };
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ tenantId: string; status: EngagementStatus }[]>`SELECT tenant_id AS "tenantId", status
        FROM tenancy.service_engagements WHERE id = ${input.engagementId}::uuid FOR UPDATE`;
      const engagement = rows[0];
      if (!engagement) return { status: "not_found" as const };
      const replay = await sql<{ id: string; matches: boolean }[]>`SELECT id, engagement_id = ${input.engagementId}::uuid
        AND author_kind = 'djai' AND body = ${input.body} AND next_action_owner = ${input.nextActionOwner}
        AND engagement_status = ${input.status} AS matches FROM tenancy.service_engagement_updates
        WHERE tenant_id = ${engagement.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`;
      if (replay[0]) return replay[0].matches ? { status: "updated" as const, updateId: replay[0].id, replayed: true as const }
        : { status: "idempotency_conflict" as const };
      if (!transitions[engagement.status].includes(input.status)) return { status: "invalid_transition" as const };
      const updateId = randomUUID();
      const inserted = await sql<{ id: string }[]>`INSERT INTO tenancy.service_engagement_updates
        (id, tenant_id, engagement_id, author_kind, body, next_action_owner, idempotency_key, engagement_status)
        VALUES (${updateId}::uuid, ${engagement.tenantId}::uuid, ${input.engagementId}::uuid, 'djai', ${input.body},
          ${input.nextActionOwner}, ${input.idempotencyKey}, ${input.status}) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING id`;
      if (!inserted[0]) {
        const existing = await sql<{ id: string; matches: boolean }[]>`SELECT id, engagement_id = ${input.engagementId}::uuid
          AND author_kind = 'djai' AND body = ${input.body} AND next_action_owner = ${input.nextActionOwner}
          AND engagement_status = ${input.status} AS matches
          FROM tenancy.service_engagement_updates WHERE tenant_id = ${engagement.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}`;
        return existing[0]?.matches ? { status: "updated" as const, updateId: existing[0].id, replayed: true as const }
          : { status: "idempotency_conflict" as const };
      }
      await sql`UPDATE tenancy.service_engagements SET status = ${input.status}, next_action_owner = ${input.nextActionOwner},
        completed_at = CASE WHEN ${input.status} = 'completed' THEN now() ELSE NULL END, updated_at = now()
        WHERE id = ${input.engagementId}::uuid`;
      await sql`INSERT INTO platform.audit_logs (actor_platform_user_id, action, target_type, target_id, request_id, result, metadata)
        VALUES (${context.platformUserId}::uuid, 'saas_service.updated', 'service_engagement', ${input.engagementId}, ${context.requestId},
          'succeeded', ${sql.json({ previousStatus: engagement.status, status: input.status, nextActionOwner: input.nextActionOwner })})`;
      return { status: "updated" as const, updateId: inserted[0].id };
    });
  }
}
