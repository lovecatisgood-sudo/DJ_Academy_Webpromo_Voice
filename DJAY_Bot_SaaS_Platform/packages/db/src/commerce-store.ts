import type { PlanVersionDefinition, PublicCatalogPlan } from "@djay/catalog";
import { sealJson } from "@djay/auth";
import type { SubscriptionState } from "@djay/entitlements";
import type { ProductKey, PublicPlanKey } from "@djay/shared";
import type { PlatformContext, TenantContext } from "@djay/tenancy";
import { calculateUsageForecast, type CustomerUnit, type QuotaReservationRequest } from "@djay/usage-billing";
import type { DatabaseClient } from "./client";
import { withPlatformTransaction, withTenantTransaction } from "./scoped-transaction";

type CurrentPlanRow = {
  catalog_version: "djay-bots-th-2026-01";
  plan_version_id: string;
  plan_key: PublicPlanKey;
  product_key: ProductKey;
  public_name: string;
  tier_name: "Starter" | "Advanced";
  tier_rank: number;
  currency: "THB";
  first_term_amount_minor: number;
  renewal_amount_minor: number;
  first_term_discount_minor: number;
  billing_interval: "year";
  billing_interval_count: 1;
  promotion_key: "first-year-launch-2026-01";
  sellable: boolean;
  stripe_mapping_state: "missing" | "test_ready" | "live_ready";
  entitlements: Record<string, boolean | string | number | null>;
  allowances: Record<string, number | null>;
  overage_rates_minor: Record<string, number | null>;
  limits: Record<string, number | null>;
  public_copy: { summary: string; highlights: string[] };
};

function planDefinition(row: CurrentPlanRow): PlanVersionDefinition {
  return {
    catalogVersion: row.catalog_version,
    planKey: row.plan_key,
    productKey: row.product_key,
    publicName: row.public_name,
    tierName: row.tier_name,
    tierRank: row.tier_rank,
    summary: row.public_copy.summary,
    currency: row.currency,
    firstTermAmountMinor: row.first_term_amount_minor,
    renewalAmountMinor: row.renewal_amount_minor,
    firstTermDiscountMinor: row.first_term_discount_minor,
    billingInterval: row.billing_interval,
    billingIntervalCount: row.billing_interval_count,
    promotionKey: row.promotion_key,
    sellable: row.sellable,
    stripeMappingState: row.stripe_mapping_state,
    entitlements: row.entitlements,
    allowances: row.allowances,
    overageRatesMinor: row.overage_rates_minor,
    limits: row.limits,
    publicHighlights: row.public_copy.highlights,
  };
}

const currentPlanQuery = (sql: DatabaseClient, now: Date) => sql<CurrentPlanRow[]>`
  SELECT catalog_version.version_key AS catalog_version,
         version.id AS plan_version_id, plan.plan_key, plan.product_key,
         plan.public_name, plan.tier_name, plan.tier_rank, version.currency,
         terms.first_term_amount_minor::int AS first_term_amount_minor,
         terms.renewal_amount_minor::int AS renewal_amount_minor,
         terms.first_term_discount_minor::int AS first_term_discount_minor,
         terms.billing_interval,
         terms.billing_interval_count, terms.promotion_key,
         (version.sellable AND terms.sellable AND EXISTS (
           SELECT 1 FROM catalog.provider_price_mappings mapping
           WHERE mapping.catalog_version_id = catalog_version.id
             AND mapping.item_kind = 'plan' AND mapping.item_key = plan.plan_key
             AND mapping.provider_key = 'stripe' AND mapping.provider_mode = 'live'
             AND mapping.status = 'ready'
         )) AS sellable,
         CASE
           WHEN EXISTS (SELECT 1 FROM catalog.provider_price_mappings mapping
             WHERE mapping.catalog_version_id = catalog_version.id
               AND mapping.item_kind = 'plan' AND mapping.item_key = plan.plan_key
               AND mapping.provider_key = 'stripe' AND mapping.provider_mode = 'live'
               AND mapping.status = 'ready') THEN 'live_ready'
           WHEN EXISTS (SELECT 1 FROM catalog.provider_price_mappings mapping
             WHERE mapping.catalog_version_id = catalog_version.id
               AND mapping.item_kind = 'plan' AND mapping.item_key = plan.plan_key
               AND mapping.provider_key = 'stripe' AND mapping.provider_mode = 'test'
               AND mapping.status = 'ready') THEN 'test_ready'
           ELSE 'missing'
         END AS stripe_mapping_state,
         version.entitlements, version.allowances, version.overage_rates_minor,
         version.limits, version.public_copy
  FROM catalog.catalog_versions catalog_version
  JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = catalog_version.id
  JOIN catalog.plan_versions version ON version.id = terms.plan_version_id
  JOIN catalog.plans plan ON plan.id = version.plan_id
  WHERE catalog_version.status = 'active' AND catalog_version.effective_from <= ${now}
    AND (catalog_version.effective_to IS NULL OR catalog_version.effective_to > ${now})
    AND plan.status = 'active' AND version.status = 'published'
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
        catalogVersion: plan.catalogVersion, planKey: plan.planKey, productKey: plan.productKey, publicName: plan.publicName,
        tierName: plan.tierName, tierRank: plan.tierRank, summary: plan.summary,
        currency: plan.currency, firstTermAmountMinor: plan.firstTermAmountMinor,
        renewalAmountMinor: plan.renewalAmountMinor, firstTermDiscountMinor: plan.firstTermDiscountMinor,
        billingInterval: plan.billingInterval, billingIntervalCount: plan.billingIntervalCount,
        promotionKey: plan.promotionKey, sellable: plan.sellable,
        stripeMappingState: plan.stripeMappingState,
        publicHighlights: plan.publicHighlights,
      };
    });
  }

  async quote(planKey: PublicPlanKey, now = new Date()) {
    const rows = await currentPlanQuery(this.client, now);
    const selected = rows.find((row) => row.plan_key === planKey);
    if (!selected) return { status: "plan_unavailable" as const };
    const plan = planDefinition(selected);
    if (plan.stripeMappingState !== "live_ready") {
      return { status: "checkout_unavailable" as const, reason: "stripe_mapping_missing" as const };
    }
    if (!plan.sellable) return { status: "checkout_unavailable" as const, reason: "plan_not_sellable" as const };
    return {
      status: "quoted" as const,
      quote: Object.freeze({
        catalogVersion: plan.catalogVersion, planKey: plan.planKey, productKey: plan.productKey,
        currency: plan.currency, amountDueMinor: plan.firstTermAmountMinor,
        renewalAmountMinor: plan.renewalAmountMinor, promotionKey: plan.promotionKey,
        billingInterval: plan.billingInterval, billingIntervalCount: plan.billingIntervalCount,
        taxStatus: "pending_customer_location" as const,
      }),
    };
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
  cancelAt: Date | null;
  cancellationStatus: "prepared" | "scheduled" | "revoked" | "applied" | "failed" | null;
}>;

type TenantUsageOverview = Readonly<{
  asOf: Date;
  billingMode: "pre_release" | "configured";
  invoicesAvailable: boolean;
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
    cancelAt: Date | null;
    cancellationStatus: "prepared" | "scheduled" | "revoked" | "applied" | "failed" | null;
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
    alertPolicy: Readonly<{
      thresholds: number[];
      exhaustionAlert: boolean;
      anomalyAlert: boolean;
      cooldownHours: number;
      emailConfigured: boolean;
    }>;
    forecast: ReturnType<typeof calculateUsageForecast>;
  }>>;
}>;

function unitForProduct(productKey: ProductKey): CustomerUnit {
  return productKey === "flowbot" ? "flow_execution" : productKey === "ai_chat" ? "ai_response" : "voice_minute";
}

export class TenantCommerceStore {
  constructor(private readonly client: DatabaseClient) {}

  async prepareStripeCheckout(context: TenantContext, input: Readonly<{
    checkoutIntentId: string;
    subscriptionId: string;
    contractSnapshotId: string;
    idempotencyKey: string;
    providerMode: "test" | "live";
    now?: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        intent_id: string; tenant_id: string; plan_key: PublicPlanKey;
        external_price_ref: string; contract_sha256_hex: string;
        first_term_amount_minor: number; currency: "THB"; replayed: boolean;
      }[]>`
        SELECT intent_id, tenant_id, plan_key, external_price_ref,
          contract_sha256_hex, first_term_amount_minor::int, currency, replayed
        FROM billing.prepare_stripe_checkout(
          ${input.checkoutIntentId}::uuid, ${input.subscriptionId}::uuid,
          ${input.contractSnapshotId}::uuid, ${input.idempotencyKey},
          ${input.providerMode}, ${input.now ?? new Date()}
        )
      `;
      const row = rows[0];
      if (!row) return { status: "checkout_unavailable" as const };
      return Object.freeze({
        status: "prepared" as const,
        checkoutIntentId: row.intent_id,
        tenantId: row.tenant_id,
        planKey: row.plan_key,
        externalPriceRef: row.external_price_ref,
        contractSha256: row.contract_sha256_hex,
        firstTermAmountMinor: row.first_term_amount_minor,
        currency: row.currency,
        replayed: row.replayed,
      });
    });
  }

  async completeStripeCheckout(context: TenantContext, input: Readonly<{
    checkoutIntentId: string;
    idempotencyKey: string;
    externalSessionRef: string | null;
    externalCustomerRef: string | null;
    externalSubscriptionRef: string | null;
    checkoutUrl: string | null;
    expiresAt: Date | null;
    failureCode: string | null;
    envelopeKey: Buffer;
    now?: Date;
  }>) {
    const checkoutUrlCiphertext = input.checkoutUrl === null
      ? null : sealJson({ checkoutUrl: input.checkoutUrl }, input.envelopeKey);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "ready" | "failed" }[]>`
        SELECT billing.complete_stripe_checkout(
          ${input.checkoutIntentId}::uuid, ${input.idempotencyKey},
          ${input.externalSessionRef}, ${input.externalCustomerRef},
          ${input.externalSubscriptionRef}, ${checkoutUrlCiphertext},
          ${input.expiresAt}, ${input.failureCode}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]?.status ?? "failed" };
    });
  }

  async prepareStripePortal(context: TenantContext, input: Readonly<{
    portalIntentId: string; idempotencyKey: string; now?: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ intent_id: string; external_customer_ref: string; replayed: boolean }[]>`
        SELECT * FROM billing.prepare_stripe_portal(
          ${input.portalIntentId}::uuid, ${input.idempotencyKey}, ${input.now ?? new Date()}
        )
      `;
      const row = rows[0];
      return row ? { status: "prepared" as const, portalIntentId: row.intent_id,
        externalCustomerRef: row.external_customer_ref, replayed: row.replayed }
        : { status: "portal_unavailable" as const };
    });
  }

  async completeStripePortal(context: TenantContext, input: Readonly<{
    portalIntentId: string; idempotencyKey: string; portalUrl: string | null;
    expiresAt: Date | null; failureCode: string | null; envelopeKey: Buffer; now?: Date;
  }>) {
    const ciphertext = input.portalUrl === null ? null : sealJson({ portalUrl: input.portalUrl }, input.envelopeKey);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "ready" | "failed" }[]>`
        SELECT billing.complete_stripe_portal(
          ${input.portalIntentId}::uuid, ${input.idempotencyKey}, ${ciphertext},
          ${input.expiresAt}, ${input.failureCode}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]?.status ?? "failed" };
    });
  }

  async prepareSubscriptionCancellation(context: TenantContext, input: Readonly<{
    requestId: string; subscriptionId: string; action: "schedule" | "revoke";
    idempotencyKey: string; now?: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        cancellation_request_id: string; external_subscription_ref: string;
        action: "schedule" | "revoke"; current_period_end: Date; replayed: boolean;
      }[]>`
        SELECT * FROM billing.prepare_subscription_cancellation(
          ${input.requestId}::uuid, ${input.subscriptionId}::uuid, ${input.action},
          ${input.idempotencyKey}, ${input.now ?? new Date()}
        )
      `;
      const row = rows[0];
      return row ? Object.freeze({ status: "prepared" as const,
        cancellationRequestId: row.cancellation_request_id,
        externalSubscriptionRef: row.external_subscription_ref,
        action: row.action, currentPeriodEnd: row.current_period_end, replayed: row.replayed })
        : Object.freeze({ status: "cancellation_unavailable" as const });
    });
  }

  async completeSubscriptionCancellation(context: TenantContext, input: Readonly<{
    cancellationRequestId: string; idempotencyKey: string;
    cancelAtPeriodEnd: boolean; effectiveAt: Date | null; failureCode: string | null; now?: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "scheduled" | "revoked" | "failed" }[]>`
        SELECT billing.complete_subscription_cancellation(
          ${input.cancellationRequestId}::uuid, ${input.idempotencyKey},
          ${input.cancelAtPeriodEnd}, ${input.effectiveAt}, ${input.failureCode},
          ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]?.status ?? "failed" as const };
    });
  }

  async listSubscriptions(context: TenantContext): Promise<readonly SubscriptionSummary[]> {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; product_key: ProductKey; plan_key: PublicPlanKey; public_name: string;
        tier_name: string; status: SubscriptionState; period_start: Date | null; period_end: Date | null;
        snapshot_id: string | null; access_mode: "none" | "read_only" | "active" | null;
        cancel_at: Date | null;
        cancellation_status: "prepared" | "scheduled" | "revoked" | "applied" | "failed" | null;
      }[]>`
        SELECT subscription.id, subscription.product_key, plan.plan_key, plan.public_name,
               plan.tier_name, subscription.status, subscription.period_start, subscription.period_end,
               snapshot.id AS snapshot_id, snapshot.access_mode, subscription.cancel_at,
               cancellation.status AS cancellation_status
        FROM tenancy.product_subscriptions subscription
        JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        LEFT JOIN LATERAL (
          SELECT id, access_mode FROM tenancy.entitlement_snapshots candidate
          WHERE candidate.subscription_id = subscription.id
          ORDER BY candidate.created_at DESC, candidate.id DESC LIMIT 1
        ) snapshot ON true
        LEFT JOIN LATERAL (
          SELECT request.status FROM billing.subscription_cancellation_requests request
          WHERE request.tenant_id = subscription.tenant_id
            AND request.subscription_id = subscription.id
          ORDER BY request.created_at DESC, request.id DESC LIMIT 1
        ) cancellation ON true
        WHERE subscription.tenant_id = ${context.tenantId}::uuid
        ORDER BY subscription.created_at, subscription.id
      `;
      return rows.map((row) => ({
        id: row.id, productKey: row.product_key, planKey: row.plan_key,
        publicName: row.public_name, tierName: row.tier_name, status: row.status,
        accessMode: row.access_mode ?? "none", snapshotId: row.snapshot_id,
        periodStart: row.period_start, periodEnd: row.period_end,
        cancelAt: row.cancel_at, cancellationStatus: row.cancellation_status,
      }));
    });
  }

  async listFinancialDocuments(context: TenantContext) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        document_id: string; document_kind: "invoice" | "credit_note";
        subscription_id: string; document_number: string; status: string;
        currency: "THB"; subtotal_minor: number; tax_minor: number; total_minor: number;
        amount_paid_minor: number; amount_remaining_minor: number;
        issued_at: Date | null; recorded_at: Date;
      }[]>`SELECT * FROM billing.list_tenant_financial_documents()`;
      return rows.map((row) => Object.freeze({
        documentId: row.document_id, documentKind: row.document_kind,
        subscriptionId: row.subscription_id, documentNumber: row.document_number,
        status: row.status, currency: row.currency,
        subtotalMinor: Number(row.subtotal_minor), taxMinor: Number(row.tax_minor),
        totalMinor: Number(row.total_minor), amountPaidMinor: Number(row.amount_paid_minor),
        amountRemainingMinor: Number(row.amount_remaining_minor),
        issuedAt: row.issued_at, recordedAt: row.recorded_at,
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
        alert_thresholds: number[] | null; exhaustion_alert: boolean | null;
        anomaly_alert: boolean | null; cooldown_hours: number | null;
        notification_profile_id: string | null;
        cancel_at: Date | null;
        cancellation_status: "prepared" | "scheduled" | "revoked" | "applied" | "failed" | null;
      }[]>`
        SELECT subscription.id AS subscription_id, subscription.product_key,
               plan.plan_key, plan.public_name, plan.tier_name, subscription.status,
               snapshot.access_mode, quota.customer_unit, quota.period_start,
               quota.period_end, quota.included_quantity, quota.safety_cap_quantity,
               quota.reserved_quantity, quota.settled_quantity,
               version.recurring_amount_minor, version.billing_interval, version.sellable,
               version.overage_rates_minor ->> quota.customer_unit AS overage_rate_minor,
               quota.alert_thresholds, quota.exhaustion_alert, quota.anomaly_alert,
               quota.cooldown_hours, quota.notification_profile_id,
               subscription.cancel_at, cancellation.status AS cancellation_status
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
                 account.reserved_quantity, account.settled_quantity,
                 preference.thresholds AS alert_thresholds,
                 preference.exhaustion_alert, preference.anomaly_alert,
                 preference.cooldown_hours, preference.notification_profile_id
          FROM tenancy.quota_accounts account
          LEFT JOIN tenancy.usage_alert_preferences preference
            ON preference.tenant_id = account.tenant_id
           AND preference.quota_account_id = account.id
          WHERE account.tenant_id = subscription.tenant_id
            AND account.subscription_id = subscription.id
          ORDER BY (${now} >= account.period_start AND ${now} < account.period_end) DESC,
                   account.period_start DESC, account.id DESC
          LIMIT 1
        ) quota ON true
        LEFT JOIN LATERAL (
          SELECT request.status FROM billing.subscription_cancellation_requests request
          WHERE request.tenant_id = subscription.tenant_id
            AND request.subscription_id = subscription.id
          ORDER BY request.created_at DESC, request.id DESC LIMIT 1
        ) cancellation ON true
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
        const forecast = calculateUsageForecast({
          periodStart: row.period_start, periodEnd: row.period_end, asOf: now,
          settledQuantity, reservedQuantity, includedQuantity, overageRateMinor,
        });
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
          cancelAt: row.cancel_at,
          cancellationStatus: row.cancellation_status,
          includedQuantity,
          safetyCapQuantity,
          reservedQuantity,
          settledQuantity,
          committedQuantity,
          remainingIncludedQuantity: includedQuantity === null ? null : Math.max(0, includedQuantity - committedQuantity),
          remainingSafetyCapQuantity: safetyCapQuantity === null ? null : Math.max(0, safetyCapQuantity - committedQuantity),
          recurringAmountMinor: row.recurring_amount_minor === null ? null : Number(row.recurring_amount_minor),
          billingInterval: row.billing_interval,
          overageRateMinor,
          pricingConfigured,
          alertPolicy: Object.freeze({
            thresholds: row.alert_thresholds ?? [50, 75, 90, 100],
            exhaustionAlert: row.exhaustion_alert ?? true,
            anomalyAlert: row.anomaly_alert ?? true,
            cooldownHours: row.cooldown_hours ?? 24,
            emailConfigured: row.notification_profile_id !== null,
          }),
          forecast,
        });
      });
      const documentCount = await sql<{ count: number }[]>`
        SELECT count(*)::int AS count FROM billing.list_tenant_financial_documents()
      `;
      return Object.freeze({
        asOf: now,
        billingMode: subscriptions.length > 0 && subscriptions.every((item) => item.pricingConfigured)
          ? "configured" as const : "pre_release" as const,
        invoicesAvailable: (documentCount[0]?.count ?? 0) > 0,
        subscriptions: Object.freeze(subscriptions),
      });
    });
  }

  async updateSafetyCap(context: TenantContext, input: Readonly<{
    subscriptionId: string;
    safetyCapQuantity: number | null;
    now?: Date;
  }>) {
    if (input.safetyCapQuantity !== null
      && (!Number.isSafeInteger(input.safetyCapQuantity) || input.safetyCapQuantity < 0)) {
      return { status: "invalid_cap" as const };
    }
    const now = input.now ?? new Date();
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${context.tenantId}:${input.subscriptionId}:safety-cap`}, 0))`;
      const rows = await sql<{
        id: string; included: string | null; previousCap: string | null;
        reserved: string; settled: string; overageConsent: "none" | "consented" | "revoked";
        availablePrepaid: string;
      }[]>`
        SELECT id, included_quantity AS included, safety_cap_quantity AS "previousCap",
          reserved_quantity AS reserved, settled_quantity AS settled,
          overage_consent_status AS "overageConsent",
          COALESCE((
            SELECT sum(GREATEST(lot.purchased_quantity - COALESCE((
              SELECT sum(CASE consumption.event_type WHEN 'allocated' THEN consumption.quantity
                ELSE -consumption.quantity END)
              FROM tenancy.usage_pack_consumptions consumption
              WHERE consumption.tenant_id = lot.tenant_id AND consumption.pack_lot_id = lot.id
            ), 0), 0))
            FROM tenancy.usage_pack_lots lot
            WHERE lot.tenant_id = account.tenant_id
              AND lot.subscription_id = account.subscription_id
              AND lot.customer_unit = account.customer_unit AND lot.status = 'active'
              AND lot.effective_from <= ${now} AND lot.expires_at > ${now}
          ), 0) AS "availablePrepaid"
        FROM tenancy.quota_accounts account
        WHERE account.tenant_id = ${context.tenantId}::uuid
          AND account.subscription_id = ${input.subscriptionId}::uuid
          AND ${now} >= account.period_start AND ${now} < account.period_end
        ORDER BY account.period_start DESC, account.id DESC LIMIT 1 FOR UPDATE OF account
      `;
      const account = rows[0];
      if (!account) return { status: "not_found" as const };
      const committed = Number(account.reserved) + Number(account.settled);
      if (input.safetyCapQuantity !== null && input.safetyCapQuantity < committed) {
        return { status: "below_committed_usage" as const, committedQuantity: committed };
      }
      const prepaidFundedLimit = Number(account.included ?? 0) + Number(account.availablePrepaid);
      if (input.safetyCapQuantity !== null && input.safetyCapQuantity > prepaidFundedLimit
        && account.overageConsent !== "consented") {
        return { status: "overage_consent_required" as const,
          includedQuantity: Number(account.included ?? 0), prepaidFundedLimit };
      }
      await sql`
        UPDATE tenancy.quota_accounts SET safety_cap_quantity = ${input.safetyCapQuantity}, updated_at = ${now}
        WHERE id = ${account.id}::uuid
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'usage.safety_cap_changed', 'quota_account', ${account.id}, ${context.requestId},
          'succeeded', ${sql.json({ previousCapQuantity: account.previousCap === null ? null : Number(account.previousCap),
            nextCapQuantity: input.safetyCapQuantity, committedQuantity: committed })}
        )
      `;
      return { status: "updated" as const, safetyCapQuantity: input.safetyCapQuantity };
    });
  }

  async configureUsageAlerts(context: TenantContext, input: Readonly<{
    subscriptionId: string;
    thresholds: readonly number[];
    exhaustionAlert: boolean;
    anomalyAlert: boolean;
    cooldownHours: number;
    recipientEmail: string;
    envelopeKey: Buffer;
    now?: Date;
  }>) {
    const thresholds = [...new Set(input.thresholds)].sort((left, right) => left - right);
    if (thresholds.some((threshold) => ![50, 75, 90, 100].includes(threshold))
      || !Number.isInteger(input.cooldownHours) || input.cooldownHours < 1 || input.cooldownHours > 168) {
      return { status: "invalid_policy" as const };
    }
    const now = input.now ?? new Date();
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const accounts = await sql<{ id: string; notification_profile_id: string | null }[]>`
        SELECT account.id, preference.notification_profile_id
        FROM tenancy.quota_accounts account
        LEFT JOIN tenancy.usage_alert_preferences preference
          ON preference.tenant_id = account.tenant_id
         AND preference.quota_account_id = account.id
        WHERE account.tenant_id = ${context.tenantId}::uuid
          AND account.subscription_id = ${input.subscriptionId}::uuid
          AND ${now} >= account.period_start AND ${now} < account.period_end
        ORDER BY account.period_start DESC, account.id DESC LIMIT 1 FOR UPDATE OF account
      `;
      const account = accounts[0];
      if (!account) return { status: "not_found" as const };
      const profileId = account.notification_profile_id ?? crypto.randomUUID();
      const recipientCiphertext = sealJson({ email: input.recipientEmail }, input.envelopeKey);
      if (account.notification_profile_id) {
        await sql`
          UPDATE tenancy.notification_profiles
          SET recipient_ciphertext = ${recipientCiphertext},
            allowed_template_keys = ARRAY['usage.allowance_alert'], status = 'active', updated_at = ${now}
          WHERE tenant_id = ${context.tenantId}::uuid AND id = ${profileId}::uuid
        `;
      } else {
        await sql`
          INSERT INTO tenancy.notification_profiles (
            id, tenant_id, name, recipient_ciphertext, allowed_template_keys,
            created_by_membership_id
          ) VALUES (
            ${profileId}::uuid, ${context.tenantId}::uuid, 'Usage and safety alerts',
            ${recipientCiphertext}, ARRAY['usage.allowance_alert'], ${context.membershipId}::uuid
          )
        `;
      }
      await sql`
        INSERT INTO tenancy.usage_alert_preferences (
          tenant_id, quota_account_id, thresholds, exhaustion_alert, anomaly_alert,
          cooldown_hours, notification_profile_id, updated_by_user_id, updated_at
        ) VALUES (
          ${context.tenantId}::uuid, ${account.id}::uuid, ${thresholds}::smallint[],
          ${input.exhaustionAlert}, ${input.anomalyAlert}, ${input.cooldownHours},
          ${profileId}::uuid, ${context.userId}::uuid, ${now}
        ) ON CONFLICT (tenant_id, quota_account_id) DO UPDATE SET
          thresholds = EXCLUDED.thresholds,
          exhaustion_alert = EXCLUDED.exhaustion_alert,
          anomaly_alert = EXCLUDED.anomaly_alert,
          cooldown_hours = EXCLUDED.cooldown_hours,
          notification_profile_id = EXCLUDED.notification_profile_id,
          updated_by_user_id = EXCLUDED.updated_by_user_id,
          updated_at = EXCLUDED.updated_at
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'usage.alert_policy_changed', 'quota_account', ${account.id}, ${context.requestId},
          'succeeded', ${sql.json({ thresholds, exhaustionAlert: input.exhaustionAlert,
            anomalyAlert: input.anomalyAlert, cooldownHours: input.cooldownHours,
            emailConfigured: true })}
        )
      `;
      return { status: "updated" as const, thresholds, exhaustionAlert: input.exhaustionAlert,
        anomalyAlert: input.anomalyAlert, cooldownHours: input.cooldownHours, emailConfigured: true };
    });
  }

  async createPendingSubscription(context: TenantContext, input: Readonly<{
    planKey: PublicPlanKey; subscriptionId: string; snapshotId: string; quotaAccountId: string; now: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const plans = await sql<CurrentPlanRow[]>`
        SELECT catalog_version.version_key AS catalog_version,
               version.id AS plan_version_id, plan.plan_key, plan.product_key,
               plan.public_name, plan.tier_name, plan.tier_rank, version.currency,
               terms.first_term_amount_minor::int AS first_term_amount_minor,
               terms.renewal_amount_minor::int AS renewal_amount_minor,
               terms.first_term_discount_minor::int AS first_term_discount_minor,
               terms.billing_interval,
               terms.billing_interval_count, terms.promotion_key,
               false AS sellable, 'missing' AS stripe_mapping_state,
               version.entitlements, version.allowances, version.overage_rates_minor,
               version.limits, version.public_copy
        FROM catalog.catalog_versions catalog_version
        JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = catalog_version.id
        JOIN catalog.plan_versions version ON version.id = terms.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        WHERE plan.plan_key = ${input.planKey} AND plan.status = 'active'
          AND catalog_version.status = 'active'
          AND catalog_version.effective_from <= ${input.now}
          AND (catalog_version.effective_to IS NULL OR catalog_version.effective_to > ${input.now})
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

  async createContractSnapshot(context: TenantContext, input: Readonly<{
    subscriptionId: string;
    contractId: string;
    acceptedAt: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const existing = await sql<{ id: string; contract_sha256_hex: string }[]>`
        SELECT id, encode(contract_sha256, 'hex') AS contract_sha256_hex
        FROM tenancy.subscription_contract_snapshots
        WHERE tenant_id = ${context.tenantId}::uuid
          AND subscription_id = ${input.subscriptionId}::uuid
      `;
      if (existing[0]) return {
        status: "exists" as const,
        contractId: existing[0].id,
        contractSha256: existing[0].contract_sha256_hex,
      };

      const rows = await sql<{
        plan_version_id: string; catalog_version_id: string; catalog_version: string;
        plan_key: PublicPlanKey; product_key: ProductKey; public_name: string; tier_name: string;
        currency: "THB"; first_term_amount_minor: number; renewal_amount_minor: number;
        first_term_discount_minor: number; billing_interval: "year"; billing_interval_count: 1;
        promotion_key: string; promotion_name: string; allowance_period_timezone: string;
        allowance_period_interval: string; allowance_rollover: boolean;
        entitlements: Record<string, boolean | string | number | null>;
        allowances: Record<string, number | null>; overage_rates_minor: Record<string, number | null>;
        limits: Record<string, number | null>;
      }[]>`
        SELECT version.id AS plan_version_id, catalog_version.id AS catalog_version_id,
               catalog_version.version_key AS catalog_version, plan.plan_key, plan.product_key,
               plan.public_name, plan.tier_name, version.currency,
               terms.first_term_amount_minor::int AS first_term_amount_minor,
               terms.renewal_amount_minor::int AS renewal_amount_minor,
               terms.first_term_discount_minor::int AS first_term_discount_minor,
               terms.billing_interval, terms.billing_interval_count, terms.promotion_key,
               promotion.public_name AS promotion_name, terms.allowance_period_timezone,
               terms.allowance_period_interval, terms.allowance_rollover,
               version.entitlements, version.allowances, version.overage_rates_minor, version.limits
        FROM tenancy.product_subscriptions subscription
        JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        JOIN catalog.plan_commercial_terms terms ON terms.plan_version_id = version.id
        JOIN catalog.catalog_versions catalog_version ON catalog_version.id = terms.catalog_version_id
        JOIN catalog.promotions promotion ON promotion.catalog_version_id = terms.catalog_version_id
          AND promotion.promotion_key = terms.promotion_key
        WHERE subscription.tenant_id = ${context.tenantId}::uuid
          AND subscription.id = ${input.subscriptionId}::uuid
        FOR UPDATE OF subscription
      `;
      const selected = rows[0];
      if (!selected) return { status: "subscription_not_found" as const };

      const contract = Object.freeze({
        schemaVersion: 1,
        catalogVersion: selected.catalog_version,
        planVersionId: selected.plan_version_id,
        planKey: selected.plan_key,
        productKey: selected.product_key,
        publicName: selected.public_name,
        tierName: selected.tier_name,
        currency: selected.currency,
        firstTermAmountMinor: selected.first_term_amount_minor,
        renewalAmountMinor: selected.renewal_amount_minor,
        firstTermDiscountMinor: selected.first_term_discount_minor,
        billingInterval: selected.billing_interval,
        billingIntervalCount: selected.billing_interval_count,
        promotion: Object.freeze({
          key: selected.promotion_key,
          publicName: selected.promotion_name,
          applicationMethod: "server_side" as const,
          termCount: 1,
        }),
        allowancePolicy: Object.freeze({
          interval: selected.allowance_period_interval,
          timezone: selected.allowance_period_timezone,
          rollover: selected.allowance_rollover,
        }),
        entitlements: selected.entitlements,
        allowances: selected.allowances,
        overageRatesMinor: selected.overage_rates_minor,
        limits: selected.limits,
        thirdPartyFeesIncluded: false,
        taxTreatment: "calculated_at_checkout" as const,
        acceptedAt: input.acceptedAt.toISOString(),
      });
      const serialized = JSON.stringify(contract);
      const inserted = await sql<{ contract_sha256_hex: string }[]>`
        INSERT INTO tenancy.subscription_contract_snapshots (
          id, tenant_id, subscription_id, catalog_version_id, plan_version_id,
          contract_json, contract_sha256, accepted_by_user_id, accepted_at
        ) VALUES (
          ${input.contractId}::uuid, ${context.tenantId}::uuid, ${input.subscriptionId}::uuid,
          ${selected.catalog_version_id}::uuid, ${selected.plan_version_id}::uuid,
          ${sql.json(contract)}, digest(convert_to(${serialized}, 'UTF8'), 'sha256'),
          ${context.userId}::uuid, ${input.acceptedAt}
        ) RETURNING encode(contract_sha256, 'hex') AS contract_sha256_hex
      `;
      return {
        status: "created" as const,
        contractId: input.contractId,
        contractSha256: inserted[0]!.contract_sha256_hex,
        contract,
      };
    });
  }

  async reserve(context: TenantContext, request: QuotaReservationRequest) {
    if (request.tenantId !== context.tenantId || !Number.isFinite(request.requestedQuantity) || request.requestedQuantity <= 0) {
      return { status: "rejected" as const, reason: "invalid_request" as const };
    }
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const reservationId = crypto.randomUUID();
      const rows = await sql<{
        status: "reserved" | "settled" | "released" | "rejected";
        reason_code: "not_entitled" | "safety_cap" | "allowance_exhausted" | null;
        reservation_id: string;
        reserved_quantity: string;
        replayed: boolean;
      }[]>`
        SELECT * FROM tenancy.reserve_customer_usage(
          ${context.tenantId}::uuid, ${request.subscriptionId}::uuid,
          ${request.entitlementSnapshotId}::uuid, ${reservationId}::uuid,
          ${request.productKey}, ${request.unit}, ${request.operationId},
          ${request.idempotencyKey}, ${request.requestedQuantity}
        )
      `;
      const result = rows[0]!;
      return result.status === "rejected"
        ? result.reason_code === "not_entitled"
          ? { status: "rejected" as const, reason: "not_entitled" as const }
          : { status: "rejected" as const, reason: result.reason_code!, reservationId: result.reservation_id }
        : {
            status: result.status,
            reservationId: result.reservation_id,
            reservedQuantity: Number(result.reserved_quantity),
            replayed: result.replayed,
          };
    });
  }

  async settle(context: TenantContext, input: Readonly<{
    reservationId: string; actualQuantity: number; idempotencyKey: string; now: Date;
  }>) {
    if (!Number.isFinite(input.actualQuantity) || input.actualQuantity < 0) return { status: "invalid_request" as const };
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: string; replayed: boolean }[]>`
        SELECT * FROM tenancy.finalize_customer_usage(
          ${context.tenantId}::uuid, ${input.reservationId}::uuid,
          ${input.actualQuantity}, ${input.idempotencyKey}, NULL
        )
      `;
      const result = rows[0]!;
      if (result.status === "not_found" || result.status === "quantity_exceeds_reservation") {
        return { status: result.status as "not_found" | "quantity_exceeds_reservation" };
      }
      return { status: "settled" as const, replayed: result.replayed };
    });
  }

  async release(context: TenantContext, input: Readonly<{
    reservationId: string; idempotencyKey: string; now: Date;
  }>) {
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: string; replayed: boolean }[]>`
        SELECT * FROM tenancy.finalize_customer_usage(
          ${context.tenantId}::uuid, ${input.reservationId}::uuid,
          0, ${input.idempotencyKey}, 'released_by_caller'
        )
      `;
      const result = rows[0]!;
      if (result.status === "not_found") return { status: "not_found" as const };
      return { status: "released" as const, replayed: result.replayed };
    });
  }
}

export class UsageAlertWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async generate(now = new Date(), limit = 500) {
    const rows = await this.client<{ generated: number }[]>`
      SELECT (tenancy.generate_usage_alerts(${now}, ${limit})
        + tenancy.generate_usage_anomaly_alerts(${now}, ${limit}))::int AS generated
    `;
    return rows[0]?.generated ?? 0;
  }
}

export class UsageAlertNotificationWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async claim(now: Date, staleBefore: Date) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'usage_alert_notification_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{
        outbox_id: string; recipient_ciphertext: string | null; payload: unknown;
        attempt_count: number; delivery_allowed: boolean;
      }[]>`SELECT * FROM tenancy.claim_usage_alert_email(${now}, ${staleBefore})`;
      const row = rows[0];
      return row ? {
        id: row.outbox_id, recipientCiphertext: row.recipient_ciphertext,
        payload: row.payload, attemptCount: row.attempt_count,
        deliveryAllowed: row.delivery_allowed,
      } : null;
    });
  }

  async finish(id: string, delivered: boolean, errorCode: string | null, deadLetter: boolean) {
    await this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'usage_alert_notification_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ finished: boolean }[]>`
        SELECT tenancy.finish_usage_alert_email(
          ${id}::uuid, ${delivered}, ${errorCode}, ${deadLetter}
        ) AS finished
      `;
      if (!rows[0]?.finished) throw new Error("usage_alert_notification_finish_conflict");
    });
  }
}

export class UsagePeriodWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async roll(now = new Date(), limit = 100) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'usage_period_worker', true)`;
      const rows = await sql<{ periodsCreated: number; reservationsReleased: number }[]>`
        SELECT periods_created::int AS "periodsCreated",
          reservations_released::int AS "reservationsReleased"
        FROM tenancy.roll_usage_periods(${now}, ${limit})
      `;
      return rows[0] ?? { periodsCreated: 0, reservationsReleased: 0 };
    });
  }
}

export class ProviderUsageReconciliationWorkerStore {
  constructor(private readonly client: DatabaseClient) {}

  async reconcile(now = new Date(), limit = 500) {
    return this.client.begin(async (sql) => {
      await sql`SELECT set_config('app.service', 'usage_reconciliation_worker', true),
        set_config('app.request_id', ${crypto.randomUUID()}, true)`;
      const rows = await sql<{ matched: number; attention: number }[]>`
        SELECT matched::int, attention::int
        FROM tenancy.reconcile_provider_usage_events(${now}, ${limit})
      `;
      return rows[0] ?? { matched: 0, attention: 0 };
    });
  }
}

export class PlatformCommerceStore {
  constructor(private readonly client: DatabaseClient) {}

  async catalogLifecycle(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; version_key: string; status: "draft" | "approved" | "active" | "retired";
        content_sha256_hex: string; effective_from: Date; effective_to: Date | null;
        approved_at: Date | null; activated_at: Date | null; retired_at: Date | null;
        plan_count: number; sellable_plan_count: number; live_mapping_count: number;
      }[]>`
        SELECT catalog_version.id, catalog_version.version_key, catalog_version.status,
               encode(catalog_version.content_sha256, 'hex') AS content_sha256_hex,
               catalog_version.effective_from, catalog_version.effective_to,
               catalog_version.approved_at, catalog_version.activated_at, catalog_version.retired_at,
               count(terms.plan_version_id)::int AS plan_count,
               count(*) FILTER (WHERE terms.sellable)::int AS sellable_plan_count,
               count(*) FILTER (WHERE EXISTS (
                 SELECT 1 FROM catalog.provider_price_mappings mapping
                 WHERE mapping.catalog_version_id = catalog_version.id
                   AND mapping.item_kind = 'plan' AND mapping.provider_mode = 'live'
                   AND mapping.status = 'ready'
               ))::int AS live_mapping_count
        FROM catalog.catalog_versions catalog_version
        LEFT JOIN catalog.plan_commercial_terms terms
          ON terms.catalog_version_id = catalog_version.id
        GROUP BY catalog_version.id
        ORDER BY catalog_version.created_at DESC, catalog_version.id DESC
      `;
      return rows.map((row) => Object.freeze({
        id: row.id, versionKey: row.version_key, status: row.status,
        contentSha256: row.content_sha256_hex, effectiveFrom: row.effective_from,
        effectiveTo: row.effective_to, approvedAt: row.approved_at,
        activatedAt: row.activated_at, retiredAt: row.retired_at,
        planCount: row.plan_count, sellablePlanCount: row.sellable_plan_count,
        liveMappingCount: row.live_mapping_count,
      }));
    });
  }

  async financialReconciliationOverview(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        result_id: string; tenant_id: string; business_name: string;
        invoice_document_id: string; external_invoice_ref: string;
        status: "matched" | "reference_mismatch" | "currency_mismatch" | "status_mismatch" | "amount_mismatch";
        differences: Record<string, unknown>; reconciled_at: Date;
        case_id: string | null; requested_action: string | null;
        review_status: "approved" | "rejected" | null;
      }[]>`
        SELECT result.id AS result_id, result.tenant_id, tenant.business_name,
          result.invoice_document_id, invoice.external_invoice_ref, result.status,
          result.differences, result.reconciled_at, remediation.id AS case_id,
          remediation.requested_action,
          (SELECT event.event_type FROM platform.financial_reconciliation_case_events event
            WHERE event.case_id = remediation.id AND event.event_type IN ('approved', 'rejected')
            ORDER BY event.created_at DESC, event.id DESC LIMIT 1) AS review_status
        FROM billing.financial_reconciliation_results result
        JOIN tenancy.tenants tenant ON tenant.id = result.tenant_id
        JOIN billing.invoice_documents invoice ON invoice.id = result.invoice_document_id
        LEFT JOIN platform.financial_reconciliation_cases remediation
          ON remediation.reconciliation_result_id = result.id
        ORDER BY (result.status <> 'matched') DESC, result.reconciled_at DESC, result.id DESC
        LIMIT 500
      `;
      const attention = rows.filter((row) => row.status !== "matched").length;
      return Object.freeze({ status: attention > 0 ? "attention" as const : "healthy" as const,
        summary: Object.freeze({ total: rows.length, matched: rows.length - attention, attention }),
        results: Object.freeze(rows.map((row) => Object.freeze({
          resultId: row.result_id, tenantId: row.tenant_id, businessName: row.business_name,
          invoiceDocumentId: row.invoice_document_id, externalInvoiceRef: row.external_invoice_ref,
          status: row.status, differences: row.differences, reconciledAt: row.reconciled_at,
          caseId: row.case_id, requestedAction: row.requested_action, reviewStatus: row.review_status,
        }))),
      });
    });
  }

  async requestFinancialReconciliationCase(context: PlatformContext, input: Readonly<{
    resultId: string; action: "investigate" | "retry_provider_retrieval" | "request_stripe_correction" | "issue_customer_credit";
    reason: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ case_id: string }[]>`
        SELECT platform.request_financial_reconciliation_case(
          ${input.resultId}::uuid, ${input.action}, ${input.reason}, ${input.now ?? new Date()}
        ) AS case_id
      `;
      return { status: "requested" as const, caseId: rows[0]!.case_id };
    });
  }

  async reviewFinancialReconciliationCase(context: PlatformContext, input: Readonly<{
    caseId: string; approve: boolean; note: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "approved" | "rejected" }[]>`
        SELECT platform.review_financial_reconciliation_case(
          ${input.caseId}::uuid, ${input.approve}, ${input.note}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async financialEventReconciliationOverview(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        result_id: string; tenant_id: string; business_name: string;
        evidence_kind: "payment" | "refund" | "credit_note"; external_ref: string;
        status: "matched" | "reference_mismatch" | "currency_mismatch" | "status_mismatch" | "amount_mismatch";
        differences: Record<string, unknown>; reconciled_at: Date; case_id: string | null;
        requested_action: string | null; review_status: "approved" | "rejected" | null;
      }[]>`
        SELECT result.id AS result_id, result.tenant_id, tenant.business_name,
          job.evidence_kind, snapshot.external_ref, result.status, result.differences,
          result.reconciled_at, remediation.id AS case_id, remediation.requested_action,
          (SELECT event.event_type FROM platform.financial_event_reconciliation_case_events event
            WHERE event.case_id = remediation.id AND event.event_type IN ('approved', 'rejected')
            ORDER BY event.created_at DESC, event.id DESC LIMIT 1) AS review_status
        FROM billing.financial_event_reconciliation_results result
        JOIN billing.financial_event_reconciliation_jobs job ON job.id = result.reconciliation_job_id
        JOIN billing.provider_financial_event_snapshots snapshot ON snapshot.id = result.provider_snapshot_id
        JOIN tenancy.tenants tenant ON tenant.id = result.tenant_id
        LEFT JOIN platform.financial_event_reconciliation_cases remediation
          ON remediation.reconciliation_result_id = result.id
        ORDER BY (result.status <> 'matched') DESC, result.reconciled_at DESC, result.id DESC LIMIT 500
      `;
      const attention = rows.filter((row) => row.status !== "matched").length;
      return Object.freeze({ status: attention ? "attention" as const : "healthy" as const,
        summary: Object.freeze({ total: rows.length, matched: rows.length - attention, attention }),
        results: Object.freeze(rows.map((row) => Object.freeze({ resultId: row.result_id,
          tenantId: row.tenant_id, businessName: row.business_name, evidenceKind: row.evidence_kind,
          externalRef: row.external_ref, status: row.status, differences: row.differences,
          reconciledAt: row.reconciled_at, caseId: row.case_id,
          requestedAction: row.requested_action, reviewStatus: row.review_status }))),
      });
    });
  }

  async requestFinancialEventReconciliationCase(context: PlatformContext, input: Readonly<{
    resultId: string; action: "investigate" | "retry_provider_retrieval" | "request_stripe_correction" | "issue_customer_credit";
    reason: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ case_id: string }[]>`SELECT platform.request_financial_event_reconciliation_case(
        ${input.resultId}::uuid, ${input.action}, ${input.reason}, ${input.now ?? new Date()}) AS case_id`;
      return { status: "requested" as const, caseId: rows[0]!.case_id };
    });
  }

  async reviewFinancialEventReconciliationCase(context: PlatformContext, input: Readonly<{
    caseId: string; approve: boolean; note: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "approved" | "rejected" }[]>`SELECT platform.review_financial_event_reconciliation_case(
        ${input.caseId}::uuid, ${input.approve}, ${input.note}, ${input.now ?? new Date()}) AS status`;
      return { status: rows[0]!.status };
    });
  }

  async accountingReconciliationOverview(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        result_id: string; tenant_id: string; business_name: string; document_kind: "invoice" | "credit_note";
        external_document_ref: string | null; status: "matched" | "missing_remote" | "reference_mismatch" | "currency_mismatch" | "amount_mismatch";
        differences: Record<string, unknown>; reconciled_at: Date; case_id: string | null;
        requested_action: string | null; review_status: "approved" | "rejected" | null;
      }[]>`
        SELECT result.id AS result_id, result.tenant_id, tenant.business_name, sync.document_kind,
          reference.external_document_ref, result.status, result.differences, result.reconciled_at,
          remediation.id AS case_id, remediation.requested_action,
          (SELECT event.event_type FROM platform.accounting_reconciliation_case_events event
            WHERE event.case_id = remediation.id AND event.event_type IN ('approved', 'rejected')
            ORDER BY event.created_at DESC, event.id DESC LIMIT 1) AS review_status
        FROM billing.accounting_reconciliation_results result
        JOIN billing.accounting_external_references reference ON reference.id = result.accounting_reference_id
        JOIN billing.accounting_sync_jobs sync ON sync.id = reference.sync_job_id
        JOIN tenancy.tenants tenant ON tenant.id = result.tenant_id
        LEFT JOIN platform.accounting_reconciliation_cases remediation
          ON remediation.reconciliation_result_id = result.id
        ORDER BY (result.status <> 'matched') DESC, result.reconciled_at DESC, result.id DESC
        LIMIT 500
      `;
      const attention = rows.filter((row) => row.status !== "matched").length;
      return Object.freeze({ status: attention ? "attention" as const : "healthy" as const,
        summary: Object.freeze({ total: rows.length, matched: rows.length - attention, attention }),
        results: Object.freeze(rows.map((row) => Object.freeze({
          resultId: row.result_id, tenantId: row.tenant_id, businessName: row.business_name,
          documentKind: row.document_kind, externalDocumentRef: row.external_document_ref,
          status: row.status, differences: row.differences, reconciledAt: row.reconciled_at,
          caseId: row.case_id, requestedAction: row.requested_action, reviewStatus: row.review_status,
        }))),
      });
    });
  }

  async listSubscriptionDunningPolicies(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        id: string; version: number; status: "draft" | "pending_review" | "active" | "retired" | "rejected";
        grace_period_hours: number; restrict_after_hours: number;
        customer_notice_offsets_hours: number[]; reason: string;
        requested_by_platform_user_id: string; reviewed_by_platform_user_id: string | null;
        requested_at: Date; reviewed_at: Date | null; activated_at: Date | null;
      }[]>`
        SELECT id, version, status, grace_period_hours, restrict_after_hours,
          customer_notice_offsets_hours, reason, requested_by_platform_user_id,
          reviewed_by_platform_user_id, requested_at, reviewed_at, activated_at
        FROM platform.subscription_dunning_policy_versions
        ORDER BY version DESC LIMIT 100
      `;
      return Object.freeze(rows.map((row) => Object.freeze({
        id: row.id, version: row.version, status: row.status,
        gracePeriodHours: row.grace_period_hours, restrictAfterHours: row.restrict_after_hours,
        customerNoticeOffsetsHours: row.customer_notice_offsets_hours, reason: row.reason,
        requestedByPlatformUserId: row.requested_by_platform_user_id,
        reviewedByPlatformUserId: row.reviewed_by_platform_user_id,
        requestedAt: row.requested_at, reviewedAt: row.reviewed_at, activatedAt: row.activated_at,
      })));
    });
  }

  async requestSubscriptionDunningPolicy(context: PlatformContext, input: Readonly<{
    gracePeriodHours: number; restrictAfterHours: number;
    customerNoticeOffsetsHours: number[]; reason: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ policy_id: string }[]>`
        SELECT platform.request_subscription_dunning_policy(
          ${input.gracePeriodHours}, ${input.restrictAfterHours},
          ${input.customerNoticeOffsetsHours}::integer[], ${input.reason}, ${input.now ?? new Date()}
        ) AS policy_id
      `;
      return { status: "pending_review" as const, policyId: rows[0]!.policy_id };
    });
  }

  async reviewSubscriptionDunningPolicy(context: PlatformContext, input: Readonly<{
    policyId: string; approve: boolean; note: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "active" | "rejected" }[]>`
        SELECT platform.review_subscription_dunning_policy(
          ${input.policyId}::uuid, ${input.approve}, ${input.note}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async webhookRecoveryOverview(context: PlatformContext) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{
        job_id: string; webhook_event_id: string; external_event_id: string; event_type: string;
        reason_code: string; status: string; attempt_count: number; occurred_at: Date;
        provider_evidence_count: number; case_id: string | null; requested_action: string | null;
        requested_by_platform_user_id: string | null; review_status: "approved" | "rejected" | null;
      }[]>`SELECT * FROM platform.list_webhook_recovery()`;
      return Object.freeze(rows.map((row) => Object.freeze({
        jobId: row.job_id, webhookEventId: row.webhook_event_id,
        externalEventId: row.external_event_id, eventType: row.event_type,
        reasonCode: row.reason_code, status: row.status, attemptCount: row.attempt_count,
        occurredAt: row.occurred_at, providerEvidenceCount: row.provider_evidence_count,
        caseId: row.case_id, requestedAction: row.requested_action, reviewStatus: row.review_status,
        requestedByPlatformUserId: row.requested_by_platform_user_id,
      })));
    });
  }

  async requestWebhookRecoveryCase(context: PlatformContext, input: Readonly<{
    jobId: string; action: "retry_application" | "accept_unsupported" | "escalate_provider";
    reason: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ case_id: string }[]>`
        SELECT platform.request_webhook_recovery_case(
          ${input.jobId}::uuid, ${input.action}, ${input.reason}, ${input.now ?? new Date()}
        ) AS case_id
      `;
      return { status: "requested" as const, caseId: rows[0]!.case_id };
    });
  }

  async reviewWebhookRecoveryCase(context: PlatformContext, input: Readonly<{
    caseId: string; approve: boolean; note: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "approved" | "rejected" }[]>`
        SELECT platform.review_webhook_recovery_case(
          ${input.caseId}::uuid, ${input.approve}, ${input.note}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async requestAccountingReconciliationCase(context: PlatformContext, input: Readonly<{
    resultId: string; action: "investigate" | "retry_retrieval" | "request_flowaccount_correction" | "credit_and_replace";
    reason: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ case_id: string }[]>`
        SELECT platform.request_accounting_reconciliation_case(
          ${input.resultId}::uuid, ${input.action}, ${input.reason}, ${input.now ?? new Date()}
        ) AS case_id
      `;
      return { status: "requested" as const, caseId: rows[0]!.case_id };
    });
  }

  async reviewAccountingReconciliationCase(context: PlatformContext, input: Readonly<{
    caseId: string; approve: boolean; note: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "approved" | "rejected" }[]>`
        SELECT platform.review_accounting_reconciliation_case(
          ${input.caseId}::uuid, ${input.approve}, ${input.note}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
    });
  }

  async approveCatalogVersion(context: PlatformContext, input: Readonly<{
    catalogVersionId: string; expectedContentSha256: string; now: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      await sql`SELECT catalog.approve_catalog_version(
        ${input.catalogVersionId}::uuid, decode(${input.expectedContentSha256}, 'hex'), ${input.now}
      )`;
      return { status: "approved" as const };
    });
  }

  async activateCatalogVersion(context: PlatformContext, input: Readonly<{
    catalogVersionId: string; expectedContentSha256: string; now: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      await sql`SELECT catalog.activate_catalog_version(
        ${input.catalogVersionId}::uuid, decode(${input.expectedContentSha256}, 'hex'), ${input.now}
      )`;
      return { status: "activated" as const };
    });
  }

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
        unreconciled_provider_events: number; provider_attention_results: number;
        open_reconciliation_cases: number;
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
             )) AS orphan_usage_events,
          (SELECT count(*)::int FROM tenancy.provider_usage_events event
           WHERE NOT EXISTS (
             SELECT 1 FROM tenancy.provider_usage_reconciliation_results result
             WHERE result.tenant_id = event.tenant_id AND result.provider_usage_event_id = event.id
           )) AS unreconciled_provider_events,
          (SELECT count(*)::int FROM tenancy.provider_usage_reconciliation_results result
           WHERE result.status <> 'matched') AS provider_attention_results,
          (SELECT count(*)::int FROM platform.usage_reconciliation_cases remediation
           WHERE NOT EXISTS (
             SELECT 1 FROM platform.usage_reconciliation_case_events event
             WHERE event.case_id = remediation.id AND event.event_type IN ('rejected', 'closed_no_balance_change')
           )) AS open_reconciliation_cases
      `;
      const providerResults = await sql<{
        result_id: string; tenant_id: string; business_name: string;
        provider_key: string; provider_meter_key: string; native_quantity: string;
        native_unit: string; estimated_cost_minor: string | null;
        status: string; reconciled_at: Date; case_id: string | null;
        requested_action: string | null; case_status: string | null;
      }[]>`
        SELECT result.id AS result_id, result.tenant_id, tenant.business_name,
          provider.provider_key, provider.provider_meter_key, provider.native_quantity,
          provider.native_unit, provider.estimated_cost_minor, result.status,
          result.reconciled_at, remediation.id AS case_id,
          remediation.requested_action,
          latest.event_type AS case_status
        FROM tenancy.provider_usage_reconciliation_results result
        JOIN tenancy.provider_usage_events provider
          ON provider.tenant_id = result.tenant_id AND provider.id = result.provider_usage_event_id
        JOIN tenancy.tenants tenant ON tenant.id = result.tenant_id
        LEFT JOIN platform.usage_reconciliation_cases remediation
          ON remediation.tenant_id = result.tenant_id
         AND remediation.reconciliation_result_id = result.id
        LEFT JOIN LATERAL (
          SELECT event.event_type FROM platform.usage_reconciliation_case_events event
          WHERE event.tenant_id = remediation.tenant_id AND event.case_id = remediation.id
          ORDER BY event.created_at DESC, event.id DESC LIMIT 1
        ) latest ON true
        WHERE result.status <> 'matched'
        ORDER BY result.reconciled_at DESC, result.id DESC LIMIT 200
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
      const gap = gaps[0] ?? {
        active_without_current_account: 0, orphan_usage_events: 0,
        unreconciled_provider_events: 0, provider_attention_results: 0,
        open_reconciliation_cases: 0,
      };
      const totalAccounts = rows[0]?.total_accounts ?? 0;
      const attentionAccounts = rows[0]?.attention_accounts ?? 0;
      const status = attentionAccounts === 0 && gap.active_without_current_account === 0
        && gap.orphan_usage_events === 0 && gap.unreconciled_provider_events === 0
        && gap.provider_attention_results === 0 ? "healthy" as const : "attention" as const;
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
          unreconciledProviderEvents: gap.unreconciled_provider_events,
          providerAttentionResults: gap.provider_attention_results,
          openReconciliationCases: gap.open_reconciliation_cases,
        }),
        accounts: Object.freeze(accounts),
        providerResults: Object.freeze(providerResults.map((result) => Object.freeze({
          resultId: result.result_id, tenantId: result.tenant_id,
          businessName: result.business_name, providerKey: result.provider_key,
          providerMeterKey: result.provider_meter_key,
          nativeQuantity: Number(result.native_quantity), nativeUnit: result.native_unit,
          estimatedCostMinor: result.estimated_cost_minor === null ? null : Number(result.estimated_cost_minor),
          status: result.status, reconciledAt: result.reconciled_at,
          caseId: result.case_id, requestedAction: result.requested_action,
          caseStatus: result.case_status,
        }))),
      });
    });
  }

  async requestUsageReconciliationCase(context: PlatformContext, input: Readonly<{
    tenantId: string; resultId: string;
    action: "investigate" | "accept_provider_only" | "correct_correlation" | "request_provider_credit";
    reason: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ case_id: string }[]>`
        SELECT platform.request_usage_reconciliation_case(
          ${input.tenantId}::uuid, ${input.resultId}::uuid, ${input.action},
          ${input.reason}, ${input.now ?? new Date()}
        ) AS case_id
      `;
      return { status: "requested" as const, caseId: rows[0]!.case_id };
    });
  }

  async reviewUsageReconciliationCase(context: PlatformContext, input: Readonly<{
    caseId: string; approve: boolean; note: string; now?: Date;
  }>) {
    return withPlatformTransaction(this.client, context, async ({ sql }) => {
      const rows = await sql<{ status: "approved" | "rejected" }[]>`
        SELECT platform.review_usage_reconciliation_case(
          ${input.caseId}::uuid, ${input.approve}, ${input.note}, ${input.now ?? new Date()}
        ) AS status
      `;
      return { status: rows[0]!.status };
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
