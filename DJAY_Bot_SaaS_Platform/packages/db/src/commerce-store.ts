import type { PlanVersionDefinition, PublicCatalogPlan } from "@djay/catalog";
import type { SubscriptionState } from "@djay/entitlements";
import type { ProductKey, PublicPlanKey } from "@djay/shared";
import type { PlatformContext, TenantContext } from "@djay/tenancy";
import type { CustomerUnit, QuotaReservationRequest } from "@djay/usage-billing";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction, withTenantTransaction } from "./scoped-transaction";

type CurrentPlanRow = {
  plan_version_id: string;
  plan_key: PublicPlanKey;
  product_key: ProductKey;
  public_name: string;
  tier_name: string;
  tier_rank: number;
  currency: "THB";
  recurring_amount_minor: number | null;
  billing_interval: "month" | "year" | null;
  sellable: boolean;
  entitlements: Record<string, boolean | string | number | null>;
  allowances: Record<string, number | null>;
  overage_rates_minor: Record<string, number | null>;
  limits: Record<string, number | null>;
  public_copy: { summary: string; highlights: string[] };
};

function planDefinition(row: CurrentPlanRow): PlanVersionDefinition {
  return {
    planKey: row.plan_key,
    productKey: row.product_key,
    publicName: row.public_name,
    tierName: row.tier_name,
    tierRank: row.tier_rank,
    summary: row.public_copy.summary,
    currency: row.currency,
    recurringAmountMinor: row.recurring_amount_minor,
    billingInterval: row.billing_interval,
    sellable: row.sellable,
    entitlements: row.entitlements,
    allowances: row.allowances,
    overageRatesMinor: row.overage_rates_minor,
    limits: row.limits,
    publicHighlights: row.public_copy.highlights,
  };
}

const currentPlanQuery = (sql: DatabaseClient, now: Date) => sql<CurrentPlanRow[]>`
  SELECT version.id AS plan_version_id, plan.plan_key, plan.product_key,
         plan.public_name, plan.tier_name, plan.tier_rank, version.currency,
         version.recurring_amount_minor, version.billing_interval, version.sellable,
         version.entitlements, version.allowances, version.overage_rates_minor,
         version.limits, version.public_copy
  FROM catalog.plans plan
  JOIN catalog.plan_versions version ON version.plan_id = plan.id
  WHERE plan.status = 'active' AND version.status = 'published'
    AND version.effective_from <= ${now}
    AND (version.effective_to IS NULL OR version.effective_to > ${now})
  ORDER BY plan.product_key, plan.tier_rank, version.version DESC
`;

export class PostgresCatalogStore {
  constructor(private readonly client: DatabaseClient) {}

  async listPublic(now = new Date()): Promise<readonly PublicCatalogPlan[]> {
    const rows = await currentPlanQuery(this.client, now);
    const unique = new Map<PublicPlanKey, CurrentPlanRow>();
    for (const row of rows) if (!unique.has(row.plan_key)) unique.set(row.plan_key, row);
    return [...unique.values()].map((row) => {
      const plan = planDefinition(row);
      return {
        planKey: plan.planKey, productKey: plan.productKey, publicName: plan.publicName,
        tierName: plan.tierName, tierRank: plan.tierRank, summary: plan.summary,
        currency: plan.currency, recurringAmountMinor: plan.recurringAmountMinor,
        billingInterval: plan.billingInterval, sellable: plan.sellable,
        publicHighlights: plan.publicHighlights,
      };
    });
  }
}

type SubscriptionSummary = Readonly<{
  id: string;
  productKey: ProductKey;
  planKey: PublicPlanKey;
  publicName: string;
  tierName: string;
  status: SubscriptionState;
  accessMode: "none" | "read_only" | "active";
  snapshotId: string | null;
  periodStart: Date | null;
  periodEnd: Date | null;
}>;

type TenantUsageOverview = Readonly<{
  asOf: Date;
  billingMode: "pre_release" | "configured";
  invoicesAvailable: false;
  subscriptions: ReadonlyArray<Readonly<{
    subscriptionId: string;
    productKey: ProductKey;
    planKey: PublicPlanKey;
    publicName: string;
    tierName: string;
    status: SubscriptionState;
    accessMode: "none" | "read_only" | "active";
    customerUnit: CustomerUnit;
    periodStart: Date;
    periodEnd: Date;
    includedQuantity: number | null;
    safetyCapQuantity: number | null;
    reservedQuantity: number;
    settledQuantity: number;
    committedQuantity: number;
    remainingIncludedQuantity: number | null;
    remainingSafetyCapQuantity: number | null;
    recurringAmountMinor: number | null;
    billingInterval: "month" | "year" | null;
    overageRateMinor: number | null;
    pricingConfigured: boolean;
  }>>;
}>;

function unitForProduct(productKey: ProductKey): CustomerUnit {
  return productKey === "flowbot" ? "flow_execution" : productKey === "ai_chat" ? "ai_response" : "voice_minute";
}

export class TenantCommerceStore {
  constructor(private readonly client: DatabaseClient) {}

  async listSubscriptions(context: TenantContext): Promise<readonly SubscriptionSummary[]> {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; product_key: ProductKey; plan_key: PublicPlanKey; public_name: string;
        tier_name: string; status: SubscriptionState; period_start: Date | null; period_end: Date | null;
        snapshot_id: string | null; access_mode: "none" | "read_only" | "active" | null;
      }[]>`
        SELECT subscription.id, subscription.product_key, plan.plan_key, plan.public_name,
               plan.tier_name, subscription.status, subscription.period_start, subscription.period_end,
               snapshot.id AS snapshot_id, snapshot.access_mode
        FROM tenancy.product_subscriptions subscription
        JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        LEFT JOIN LATERAL (
          SELECT id, access_mode FROM tenancy.entitlement_snapshots candidate
          WHERE candidate.subscription_id = subscription.id
          ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
        ) snapshot ON true
        WHERE subscription.tenant_id = ${context.tenantId}::uuid
        ORDER BY subscription.created_at, subscription.id
      `;
      return rows.map((row) => ({
        id: row.id, productKey: row.product_key, planKey: row.plan_key,
        publicName: row.public_name, tierName: row.tier_name, status: row.status,
        accessMode: row.access_mode ?? "none", snapshotId: row.snapshot_id,
        periodStart: row.period_start, periodEnd: row.period_end,
      }));
    });
  }

  async usageOverview(context: TenantContext, now = new Date()): Promise<TenantUsageOverview> {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        subscription_id: string; product_key: ProductKey; plan_key: PublicPlanKey;
        public_name: string; tier_name: string; status: SubscriptionState;
        access_mode: "none" | "read_only" | "active" | null;
        customer_unit: CustomerUnit; period_start: Date; period_end: Date;
        included_quantity: string | null; safety_cap_quantity: string | null;
        reserved_quantity: string; settled_quantity: string;
        recurring_amount_minor: number | null; billing_interval: "month" | "year" | null;
        sellable: boolean; overage_rate_minor: string | null;
      }[]>`
        SELECT subscription.id AS subscription_id, subscription.product_key,
               plan.plan_key, plan.public_name, plan.tier_name, subscription.status,
               snapshot.access_mode, quota.customer_unit, quota.period_start,
               quota.period_end, quota.included_quantity, quota.safety_cap_quantity,
               quota.reserved_quantity, quota.settled_quantity,
               version.recurring_amount_minor, version.billing_interval, version.sellable,
               version.overage_rates_minor ->> quota.customer_unit AS overage_rate_minor
        FROM tenancy.product_subscriptions subscription
        JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        LEFT JOIN LATERAL (
          SELECT candidate.access_mode
          FROM tenancy.entitlement_snapshots candidate
          WHERE candidate.tenant_id = subscription.tenant_id
            AND candidate.subscription_id = subscription.id
          ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
        ) snapshot ON true
        JOIN LATERAL (
          SELECT account.customer_unit, account.period_start, account.period_end,
                 account.included_quantity, account.safety_cap_quantity,
                 account.reserved_quantity, account.settled_quantity
          FROM tenancy.quota_accounts account
          WHERE account.tenant_id = subscription.tenant_id
            AND account.subscription_id = subscription.id
          ORDER BY (${now} >= account.period_start AND ${now} < account.period_end) DESC,
                   account.period_start DESC, account.id DESC
          LIMIT 1
        ) quota ON true
        WHERE subscription.tenant_id = ${context.tenantId}::uuid
        ORDER BY subscription.created_at, subscription.id
      `;
      const subscriptions = rows.map((row) => {
        const includedQuantity = row.included_quantity === null ? null : Number(row.included_quantity);
        const safetyCapQuantity = row.safety_cap_quantity === null ? null : Number(row.safety_cap_quantity);
        const reservedQuantity = Number(row.reserved_quantity);
        const settledQuantity = Number(row.settled_quantity);
        const committedQuantity = reservedQuantity + settledQuantity;
        const overageRateMinor = row.overage_rate_minor === null ? null : Number(row.overage_rate_minor);
        const pricingConfigured = row.sellable && row.recurring_amount_minor !== null
          && row.billing_interval !== null;
        return Object.freeze({
          subscriptionId: row.subscription_id,
          productKey: row.product_key,
          planKey: row.plan_key,
          publicName: row.public_name,
          tierName: row.tier_name,
          status: row.status,
          accessMode: row.access_mode ?? "none",
          customerUnit: row.customer_unit,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          includedQuantity,
          safetyCapQuantity,
          reservedQuantity,
          settledQuantity,
          committedQuantity,
          remainingIncludedQuantity: includedQuantity === null ? null : Math.max(0, includedQuantity - committedQuantity),
          remainingSafetyCapQuantity: safetyCapQuantity === null ? null : Math.max(0, safetyCapQuantity - committedQuantity),
          recurringAmountMinor: row.recurring_amount_minor,
          billingInterval: row.billing_interval,
          overageRateMinor,
          pricingConfigured,
        });
      });
      return Object.freeze({
        asOf: now,
        billingMode: subscriptions.length > 0 && subscriptions.every((item) => item.pricingConfigured)
          ? "configured" as const : "pre_release" as const,
        invoicesAvailable: false as const,
        subscriptions: Object.freeze(subscriptions),
      });
    });
  }

  async createPendingSubscription(context: TenantContext, input: Readonly<{
    planKey: PublicPlanKey; subscriptionId: string; snapshotId: string; quotaAccountId: string; now: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const plans = await sql<CurrentPlanRow[]>`
        SELECT version.id AS plan_version_id, plan.plan_key, plan.product_key,
               plan.public_name, plan.tier_name, plan.tier_rank, version.currency,
               version.recurring_amount_minor, version.billing_interval, version.sellable,
               version.entitlements, version.allowances, version.overage_rates_minor,
               version.limits, version.public_copy
        FROM catalog.plans plan JOIN catalog.plan_versions version ON version.plan_id = plan.id
        WHERE plan.plan_key = ${input.planKey} AND plan.status = 'active'
          AND version.status = 'published' AND version.effective_from <= ${input.now}
          AND (version.effective_to IS NULL OR version.effective_to > ${input.now})
        ORDER BY version.version DESC LIMIT 1
      `;
      const selected = plans[0];
      if (!selected) return { status: "plan_unavailable" as const };
      const existing = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.product_subscriptions
        WHERE tenant_id = ${context.tenantId}::uuid AND product_key = ${selected.product_key}
          AND status <> 'cancelled' LIMIT 1 FOR UPDATE
      `;
      if (existing[0]) return { status: "product_already_subscribed" as const };
      const resolved = {
        tenantId: context.tenantId, subscriptionId: input.subscriptionId,
        productKey: selected.product_key, publicPlanKey: selected.plan_key,
        planVersionId: selected.plan_version_id, accessMode: "none",
        entitlements: selected.entitlements, allowances: selected.allowances,
        overageRatesMinor: selected.overage_rates_minor, limits: selected.limits,
        resolvedAt: input.now.toISOString(),
      };
      await sql`
        INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status)
        VALUES (${input.subscriptionId}::uuid, ${context.tenantId}::uuid, ${selected.product_key}, ${selected.plan_version_id}::uuid, 'pending')
      `;
      await sql`
        INSERT INTO tenancy.entitlement_snapshots (
          id, tenant_id, subscription_id, product_key, plan_version_id,
          subscription_status, access_mode, resolved_json, resolution_hash
        ) VALUES (
          ${input.snapshotId}::uuid, ${context.tenantId}::uuid, ${input.subscriptionId}::uuid,
          ${selected.product_key}, ${selected.plan_version_id}::uuid, 'pending', 'none',
          ${sql.json(resolved)}, digest(convert_to(${JSON.stringify(resolved)}, 'UTF8'), 'sha256')
        )
      `;
      const unit = unitForProduct(selected.product_key);
      await sql`
        INSERT INTO tenancy.quota_accounts (
          id, tenant_id, subscription_id, product_key, customer_unit,
          period_start, period_end, included_quantity
        ) VALUES (
          ${input.quotaAccountId}::uuid, ${context.tenantId}::uuid, ${input.subscriptionId}::uuid,
          ${selected.product_key}, ${unit}, ${input.now},
          ${new Date(input.now.getTime() + 31 * 24 * 60 * 60 * 1000)},
          ${(selected.allowances[unit] as number | null | undefined) ?? null}
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'subscription.requested', 'product_subscription', ${input.subscriptionId},
          ${context.requestId}, 'succeeded', ${sql.json({ publicPlanKey: input.planKey })}
        )
      `;
      return { status: "created" as const, subscriptionId: input.subscriptionId };
    });
  }

  async reserve(context: TenantContext, request: QuotaReservationRequest) {
    if (request.tenantId !== context.tenantId || !Number.isFinite(request.requestedQuantity) || request.requestedQuantity <= 0) {
      return { status: "rejected" as const, reason: "invalid_request" as const };
    }
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const replay = await sql<{ id: string; status: "reserved" | "settled" | "released" | "rejected"; reserved_quantity: string }[]>`
        SELECT id, status, reserved_quantity FROM tenancy.usage_reservations
        WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${request.idempotencyKey}
      `;
      if (replay[0]) return { status: replay[0].status, reservationId: replay[0].id, reservedQuantity: Number(replay[0].reserved_quantity), replayed: true as const };
      const accounts = await sql<{
        id: string; reserved_quantity: string; settled_quantity: string; safety_cap_quantity: string | null;
      }[]>`
        SELECT account.id, account.reserved_quantity, account.settled_quantity, account.safety_cap_quantity
        FROM tenancy.quota_accounts account
        JOIN tenancy.entitlement_snapshots snapshot ON snapshot.id = ${request.entitlementSnapshotId}::uuid
          AND snapshot.tenant_id = account.tenant_id AND snapshot.subscription_id = account.subscription_id
        WHERE account.tenant_id = ${context.tenantId}::uuid
          AND account.subscription_id = ${request.subscriptionId}::uuid
          AND account.product_key = ${request.productKey} AND account.customer_unit = ${request.unit}
          AND snapshot.access_mode = 'active'
          AND now() >= account.period_start AND now() < account.period_end
        FOR UPDATE OF account
      `;
      const account = accounts[0];
      if (!account) return { status: "rejected" as const, reason: "not_entitled" as const };
      const projected = Number(account.reserved_quantity) + Number(account.settled_quantity) + request.requestedQuantity;
      const overCap = account.safety_cap_quantity !== null && projected > Number(account.safety_cap_quantity);
      const reservationId = crypto.randomUUID();
      const quantity = overCap ? 0 : request.requestedQuantity;
      await sql`
        INSERT INTO tenancy.usage_reservations (
          id, tenant_id, quota_account_id, entitlement_snapshot_id, operation_id,
          idempotency_key, requested_quantity, reserved_quantity, status, reason_code
        ) VALUES (
          ${reservationId}::uuid, ${context.tenantId}::uuid, ${account.id}::uuid,
          ${request.entitlementSnapshotId}::uuid, ${request.operationId}, ${request.idempotencyKey},
          ${request.requestedQuantity}, ${quantity}, ${overCap ? "rejected" : "reserved"},
          ${overCap ? "safety_cap" : null}
        )
      `;
      if (!overCap) await sql`
        UPDATE tenancy.quota_accounts SET reserved_quantity = reserved_quantity + ${quantity}, updated_at = now()
        WHERE id = ${account.id}::uuid
      `;
      if (!overCap) await sql`
        INSERT INTO tenancy.usage_events (
          tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
          product_key, operation_id, event_type, customer_unit, customer_quantity,
          idempotency_key, occurred_at
        ) VALUES (
          ${context.tenantId}::uuid, ${request.subscriptionId}::uuid,
          ${request.entitlementSnapshotId}::uuid, ${reservationId}::uuid,
          ${request.productKey}, ${request.operationId}, 'reserved', ${request.unit},
          ${quantity}, ${`${request.idempotencyKey}:reserved`}, now()
        )
      `;
      return overCap
        ? { status: "rejected" as const, reason: "safety_cap" as const, reservationId }
        : { status: "reserved" as const, reservationId, reservedQuantity: quantity, replayed: false as const };
    });
  }

  async settle(context: TenantContext, input: Readonly<{
    reservationId: string; actualQuantity: number; idempotencyKey: string; now: Date;
  }>) {
    if (!Number.isFinite(input.actualQuantity) || input.actualQuantity < 0) return { status: "invalid_request" as const };
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const replay = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.usage_events
        WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}
      `;
      if (replay[0]) return { status: "settled" as const, replayed: true as const };
      const rows = await sql<{
        quota_account_id: string; entitlement_snapshot_id: string; subscription_id: string;
        product_key: ProductKey; customer_unit: CustomerUnit; operation_id: string;
        reserved_quantity: string; status: string;
      }[]>`
        SELECT reservation.quota_account_id, reservation.entitlement_snapshot_id,
               account.subscription_id, account.product_key, account.customer_unit,
               reservation.operation_id, reservation.reserved_quantity, reservation.status
        FROM tenancy.usage_reservations reservation
        JOIN tenancy.quota_accounts account ON account.id = reservation.quota_account_id
          AND account.tenant_id = reservation.tenant_id
        WHERE reservation.tenant_id = ${context.tenantId}::uuid
          AND reservation.id = ${input.reservationId}::uuid
        FOR UPDATE OF reservation, account
      `;
      const reservation = rows[0];
      if (!reservation || reservation.status !== "reserved") return { status: "not_found" as const };
      await sql`
        UPDATE tenancy.quota_accounts
        SET reserved_quantity = reserved_quantity - ${Number(reservation.reserved_quantity)},
            settled_quantity = settled_quantity + ${input.actualQuantity}, updated_at = now()
        WHERE id = ${reservation.quota_account_id}::uuid
      `;
      await sql`
        UPDATE tenancy.usage_reservations
        SET status = 'settled', settled_quantity = ${input.actualQuantity}, settled_at = ${input.now}
        WHERE id = ${input.reservationId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.usage_events (
          tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
          product_key, operation_id, event_type, customer_unit, customer_quantity,
          idempotency_key, occurred_at
        ) VALUES (
          ${context.tenantId}::uuid, ${reservation.subscription_id}::uuid,
          ${reservation.entitlement_snapshot_id}::uuid, ${input.reservationId}::uuid,
          ${reservation.product_key}, ${reservation.operation_id}, 'settled',
          ${reservation.customer_unit}, ${input.actualQuantity}, ${input.idempotencyKey}, ${input.now}
        )
      `;
      return { status: "settled" as const, replayed: false as const };
    });
  }

  async release(context: TenantContext, input: Readonly<{
    reservationId: string; idempotencyKey: string; now: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const replay = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.usage_events
        WHERE tenant_id = ${context.tenantId}::uuid AND idempotency_key = ${input.idempotencyKey}
      `;
      if (replay[0]) return { status: "released" as const, replayed: true as const };
      const rows = await sql<{
        quota_account_id: string; entitlement_snapshot_id: string; subscription_id: string;
        product_key: ProductKey; customer_unit: CustomerUnit; operation_id: string;
        reserved_quantity: string; status: string;
      }[]>`
        SELECT reservation.quota_account_id, reservation.entitlement_snapshot_id,
               account.subscription_id, account.product_key, account.customer_unit,
               reservation.operation_id, reservation.reserved_quantity, reservation.status
        FROM tenancy.usage_reservations reservation
        JOIN tenancy.quota_accounts account ON account.id = reservation.quota_account_id
          AND account.tenant_id = reservation.tenant_id
        WHERE reservation.tenant_id = ${context.tenantId}::uuid
          AND reservation.id = ${input.reservationId}::uuid
        FOR UPDATE OF reservation, account
      `;
      const reservation = rows[0];
      if (!reservation || reservation.status !== "reserved") return { status: "not_found" as const };
      await sql`
        UPDATE tenancy.quota_accounts
        SET reserved_quantity = reserved_quantity - ${Number(reservation.reserved_quantity)}, updated_at = now()
        WHERE id = ${reservation.quota_account_id}::uuid
      `;
      await sql`
        UPDATE tenancy.usage_reservations SET status = 'released', settled_at = ${input.now}
        WHERE id = ${input.reservationId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.usage_events (
          tenant_id, subscription_id, entitlement_snapshot_id, reservation_id,
          product_key, operation_id, event_type, customer_unit, customer_quantity,
          idempotency_key, occurred_at
        ) VALUES (
          ${context.tenantId}::uuid, ${reservation.subscription_id}::uuid,
          ${reservation.entitlement_snapshot_id}::uuid, ${input.reservationId}::uuid,
          ${reservation.product_key}, ${reservation.operation_id}, 'released',
          ${reservation.customer_unit}, ${Number(reservation.reserved_quantity)},
          ${input.idempotencyKey}, ${input.now}
        )
      `;
      return { status: "released" as const, replayed: false as const };
    });
  }
}

export class PlatformCommerceStore {
  constructor(private readonly client: DatabaseClient) {}

  async reconciliationOverview(context: PlatformContext, now = new Date()) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        quota_account_id: string; tenant_id: string; business_name: string;
        product_key: ProductKey; public_name: string; customer_unit: CustomerUnit;
        period_start: Date; period_end: Date; account_reserved: string;
        account_settled: string; reservation_reserved: string;
        reservation_settled: string; open_reservations: number;
        settled_events: string; credited_events: string; waived_events: string;
        total_accounts: number; attention_accounts: number;
        total_expired_open_reservations: number;
      }[]>`
        WITH reservation_totals AS (
          SELECT reservation.quota_account_id,
                 COALESCE(sum(reservation.reserved_quantity)
                   FILTER (WHERE reservation.status = 'reserved'), 0) AS reservation_reserved,
                 COALESCE(sum(reservation.settled_quantity)
                   FILTER (WHERE reservation.status = 'settled'), 0) AS reservation_settled,
                 count(*) FILTER (WHERE reservation.status = 'reserved')::int AS open_reservations
          FROM tenancy.usage_reservations reservation
          GROUP BY reservation.quota_account_id
        ), event_accounts AS (
          SELECT event.event_type, event.customer_quantity,
                 COALESCE(reservation.quota_account_id, period_account.id) AS quota_account_id
          FROM tenancy.usage_events event
          LEFT JOIN tenancy.usage_reservations reservation
            ON reservation.tenant_id = event.tenant_id
           AND reservation.id = event.reservation_id
          LEFT JOIN LATERAL (
            SELECT account.id
            FROM tenancy.quota_accounts account
            WHERE event.reservation_id IS NULL
              AND account.tenant_id = event.tenant_id
              AND account.subscription_id = event.subscription_id
              AND account.product_key = event.product_key
              AND account.customer_unit = event.customer_unit
              AND event.occurred_at >= account.period_start
              AND event.occurred_at < account.period_end
            ORDER BY account.period_start DESC, account.id DESC
            LIMIT 1
          ) period_account ON true
        ), event_totals AS (
          SELECT event.quota_account_id,
                 COALESCE(sum(event.customer_quantity)
                   FILTER (WHERE event.event_type = 'settled'), 0) AS settled_events,
                 COALESCE(sum(event.customer_quantity)
                   FILTER (WHERE event.event_type = 'credited'), 0) AS credited_events,
                 COALESCE(sum(event.customer_quantity)
                   FILTER (WHERE event.event_type = 'waived'), 0) AS waived_events
          FROM event_accounts event
          WHERE event.quota_account_id IS NOT NULL
          GROUP BY event.quota_account_id
        ), account_facts AS (
          SELECT account.id AS quota_account_id, account.tenant_id,
                 tenant.business_name, account.product_key, plan.public_name,
                 account.customer_unit, account.period_start, account.period_end,
                 account.reserved_quantity AS account_reserved,
                 account.settled_quantity AS account_settled,
                 COALESCE(reservation.reservation_reserved, 0) AS reservation_reserved,
                 COALESCE(reservation.reservation_settled, 0) AS reservation_settled,
                 COALESCE(reservation.open_reservations, 0)::int AS open_reservations,
                 COALESCE(event.settled_events, 0) AS settled_events,
                 COALESCE(event.credited_events, 0) AS credited_events,
                 COALESCE(event.waived_events, 0) AS waived_events
          FROM tenancy.quota_accounts account
          JOIN tenancy.tenants tenant ON tenant.id = account.tenant_id
          JOIN tenancy.product_subscriptions subscription
            ON subscription.tenant_id = account.tenant_id
           AND subscription.id = account.subscription_id
          JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
          JOIN catalog.plans plan ON plan.id = version.plan_id
          LEFT JOIN reservation_totals reservation ON reservation.quota_account_id = account.id
          LEFT JOIN event_totals event ON event.quota_account_id = account.id
        ), evaluated AS (
          SELECT account.*,
                 (account.account_reserved <> account.reservation_reserved
                   OR account.account_settled <> account.settled_events
                     - account.credited_events - account.waived_events
                   OR account.reservation_settled <> account.settled_events
                   OR (account.period_end <= ${now} AND account.open_reservations > 0)) AS needs_attention,
                 CASE WHEN account.period_end <= ${now}
                   THEN account.open_reservations ELSE 0 END AS expired_open_reservations
          FROM account_facts account
        )
        SELECT account.*,
               count(*) OVER ()::int AS total_accounts,
               count(*) FILTER (WHERE account.needs_attention) OVER ()::int AS attention_accounts,
               COALESCE(sum(account.expired_open_reservations) OVER (), 0)::int
                 AS total_expired_open_reservations
        FROM evaluated account
        ORDER BY account.needs_attention DESC, account.period_end DESC,
                 account.business_name, account.product_key, account.quota_account_id
        LIMIT 500
      `;
      const gaps = await sql<{
        active_without_current_account: number; orphan_usage_events: number;
      }[]>`
        SELECT
          (SELECT count(*)::int
           FROM tenancy.product_subscriptions subscription
           WHERE subscription.status IN ('trialing', 'active', 'past_due', 'grace_period', 'restricted')
             AND NOT EXISTS (
               SELECT 1 FROM tenancy.quota_accounts account
               WHERE account.tenant_id = subscription.tenant_id
                 AND account.subscription_id = subscription.id
                 AND ${now} >= account.period_start AND ${now} < account.period_end
             )) AS active_without_current_account,
          (SELECT count(*)::int
           FROM tenancy.usage_events event
           LEFT JOIN tenancy.usage_reservations reservation
             ON reservation.tenant_id = event.tenant_id AND reservation.id = event.reservation_id
           WHERE reservation.id IS NULL
             AND NOT EXISTS (
               SELECT 1 FROM tenancy.quota_accounts account
               WHERE account.tenant_id = event.tenant_id
                 AND account.subscription_id = event.subscription_id
                 AND account.product_key = event.product_key
                 AND account.customer_unit = event.customer_unit
                 AND event.occurred_at >= account.period_start
                 AND event.occurred_at < account.period_end
             )) AS orphan_usage_events
      `;
      const accounts = rows.map((row) => {
        const accountReserved = Number(row.account_reserved);
        const accountSettled = Number(row.account_settled);
        const reservationReserved = Number(row.reservation_reserved);
        const reservationSettled = Number(row.reservation_settled);
        const settledEvents = Number(row.settled_events);
        const creditedEvents = Number(row.credited_events);
        const waivedEvents = Number(row.waived_events);
        const netSettledEvents = settledEvents - creditedEvents - waivedEvents;
        const reservedVariance = accountReserved - reservationReserved;
        const settledVariance = accountSettled - netSettledEvents;
        const eventVariance = reservationSettled - settledEvents;
        const expiredOpenReservations = row.period_end <= now ? row.open_reservations : 0;
        const status = reservedVariance === 0 && settledVariance === 0
          && eventVariance === 0 && expiredOpenReservations === 0 ? "healthy" as const : "attention" as const;
        return Object.freeze({
          quotaAccountId: row.quota_account_id,
          tenantId: row.tenant_id,
          businessName: row.business_name,
          productKey: row.product_key,
          publicName: row.public_name,
          customerUnit: row.customer_unit,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          accountReserved,
          reservationReserved,
          accountSettled,
          reservationSettled,
          settledEvents,
          creditedEvents,
          waivedEvents,
          netSettledEvents,
          openReservations: row.open_reservations,
          expiredOpenReservations,
          reservedVariance,
          settledVariance,
          eventVariance,
          status,
        });
      });
      const gap = gaps[0] ?? { active_without_current_account: 0, orphan_usage_events: 0 };
      const totalAccounts = rows[0]?.total_accounts ?? 0;
      const attentionAccounts = rows[0]?.attention_accounts ?? 0;
      const status = attentionAccounts === 0 && gap.active_without_current_account === 0
        && gap.orphan_usage_events === 0 ? "healthy" as const : "attention" as const;
      return Object.freeze({
        asOf: now,
        status,
        summary: Object.freeze({
          quotaAccounts: totalAccounts,
          displayedAccounts: accounts.length,
          healthyAccounts: totalAccounts - attentionAccounts,
          attentionAccounts,
          activeWithoutCurrentAccount: gap.active_without_current_account,
          orphanUsageEvents: gap.orphan_usage_events,
          expiredOpenReservations: rows[0]?.total_expired_open_reservations ?? 0,
        }),
        accounts: Object.freeze(accounts),
      });
    });
  }

  async overview(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const counts = await sql<{ tenants: number; subscriptions: number; pending: number; active: number }[]>`
        SELECT
          (SELECT count(*)::int FROM tenancy.tenants) AS tenants,
          count(*)::int AS subscriptions,
          count(*) FILTER (WHERE status = 'pending')::int AS pending,
          count(*) FILTER (WHERE status = 'active')::int AS active
        FROM tenancy.product_subscriptions
      `;
      return counts[0] ?? { tenants: 0, subscriptions: 0, pending: 0, active: 0 };
    });
  }

  async listSubscriptions(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => sql<{
      id: string; tenantId: string; businessName: string; productKey: ProductKey;
      planKey: PublicPlanKey; publicName: string; status: SubscriptionState; createdAt: Date;
    }[]>`
      SELECT subscription.id, subscription.tenant_id AS "tenantId",
             tenant.business_name AS "businessName", subscription.product_key AS "productKey",
             plan.plan_key AS "planKey", plan.public_name AS "publicName",
             subscription.status, subscription.created_at AS "createdAt"
      FROM tenancy.product_subscriptions subscription
      JOIN tenancy.tenants tenant ON tenant.id = subscription.tenant_id
      JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id
      ORDER BY subscription.created_at DESC, subscription.id DESC
      LIMIT 200
    `);
  }

  async activatePilot(context: PlatformContext, input: Readonly<{
    subscriptionId: string; snapshotId: string; now: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        tenant_id: string; product_key: ProductKey; plan_version_id: string;
        status: SubscriptionState; plan_key: PublicPlanKey;
        entitlements: Record<string, boolean | string | number | null>;
        allowances: Record<string, number | null>; overage_rates_minor: Record<string, number | null>;
        limits: Record<string, number | null>;
      }[]>`
        SELECT subscription.tenant_id, subscription.product_key, subscription.plan_version_id,
               subscription.status, plan.plan_key, version.entitlements, version.allowances,
               version.overage_rates_minor, version.limits
        FROM tenancy.product_subscriptions subscription
        JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE subscription.id = ${input.subscriptionId}::uuid
        FOR UPDATE OF subscription
      `;
      const subscription = rows[0];
      if (!subscription || subscription.status !== "pending") return { status: "not_found" as const };
      const periodEnd = new Date(input.now);
      periodEnd.setUTCMonth(periodEnd.getUTCMonth() + 1);
      const resolved = {
        tenantId: subscription.tenant_id, subscriptionId: input.subscriptionId,
        productKey: subscription.product_key, publicPlanKey: subscription.plan_key,
        planVersionId: subscription.plan_version_id, accessMode: "active",
        entitlements: subscription.entitlements, allowances: subscription.allowances,
        overageRatesMinor: subscription.overage_rates_minor, limits: subscription.limits,
        resolvedAt: input.now.toISOString(),
      };
      await sql`
        UPDATE tenancy.product_subscriptions
        SET status = 'active', period_start = ${input.now}, period_end = ${periodEnd}, updated_at = now()
        WHERE id = ${input.subscriptionId}::uuid
      `;
      await sql`
        INSERT INTO tenancy.entitlement_snapshots (
          id, tenant_id, subscription_id, product_key, plan_version_id,
          subscription_status, access_mode, resolved_json, resolution_hash
        ) VALUES (
          ${input.snapshotId}::uuid, ${subscription.tenant_id}::uuid, ${input.subscriptionId}::uuid,
          ${subscription.product_key}, ${subscription.plan_version_id}::uuid, 'active', 'active',
          ${sql.json(resolved)}, digest(convert_to(${JSON.stringify(resolved)}, 'UTF8'), 'sha256')
        )
      `;
      const unit = unitForProduct(subscription.product_key);
      await sql`
        UPDATE tenancy.quota_accounts
        SET period_start = ${input.now}, period_end = ${periodEnd},
            included_quantity = ${(subscription.allowances[unit] as number | null | undefined) ?? null},
            reserved_quantity = 0, settled_quantity = 0, updated_at = now()
        WHERE tenant_id = ${subscription.tenant_id}::uuid AND subscription_id = ${input.subscriptionId}::uuid
      `;
      await sql`
        INSERT INTO platform.audit_logs (
          actor_platform_user_id, action, target_type, target_id, request_id,
          reason, result, metadata
        ) VALUES (
          ${context.platformUserId}::uuid, 'subscription.pilot_activated', 'product_subscription',
          ${input.subscriptionId}, ${context.requestId}, 'manual pilot activation', 'succeeded',
          ${sql.json({ tenantId: subscription.tenant_id, publicPlanKey: subscription.plan_key })}
        )
      `;
      return { status: "activated" as const, tenantId: subscription.tenant_id };
    });
  }
}
