import {
  boolean,
  bigint,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  primaryKey,
  text,
  smallint,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer }>({ dataType: () => "bytea" });
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

export const identitySchema = pgSchema("identity");
export const tenancySchema = pgSchema("tenancy");
export const platformSchema = pgSchema("platform");
export const operationsSchema = pgSchema("operations");
export const catalogSchema = pgSchema("catalog");
export const billingSchema = pgSchema("billing");

export const users = identitySchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  displayName: text("display_name").notNull(),
  status: text("status").notNull().default("pending_verification"),
  locale: text("locale").notNull().default("th"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

export const userCredentials = identitySchema.table("user_credentials", {
  userId: uuid("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  passwordHash: text("password_hash").notNull(),
  passwordChangedAt: timestamp("password_changed_at", { withTimezone: true }).notNull().defaultNow(),
  compromisedAt: timestamp("compromised_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const emailAddresses = identitySchema.table("email_addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  email: text("email").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  isPrimary: boolean("is_primary").notNull().default(false),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [
  uniqueIndex("identity_email_normalized_unique").on(table.emailNormalized),
]);

export const tenants = tenancySchema.table("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  businessName: text("business_name").notNull(),
  status: text("status").notNull().default("active"),
  locale: text("locale").notNull().default("th"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
});

export const memberships = tenancySchema.table("memberships", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  role: text("role").notNull(),
  status: text("status").notNull().default("active"),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("tenancy_membership_user_unique").on(table.tenantId, table.userId),
  index("tenancy_memberships_user_active").on(table.userId, table.status, table.tenantId),
]);

export const tenantOnboarding = tenancySchema.table("tenant_onboarding", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "cascade" }),
  stage: text("stage").notNull().default("account_created"),
  profileCompletedAt: timestamp("profile_completed_at", { withTimezone: true }),
  productSelectedAt: timestamp("product_selected_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const signupIntents = identitySchema.table("signup_intents", {
  id: uuid("id").primaryKey().defaultRandom(),
  idempotencyKey: uuid("idempotency_key").notNull().unique(),
  requestHash: bytea("request_hash").notNull(),
  emailNormalized: text("email_normalized").notNull(),
  displayName: text("display_name").notNull(),
  businessName: text("business_name").notNull(),
  passwordHash: text("password_hash"),
  locale: text("locale").notNull().default("th"),
  timezone: text("timezone").notNull().default("Asia/Bangkok"),
  termsVersion: text("terms_version").notNull(),
  privacyVersion: text("privacy_version").notNull(),
  selectedPlanKey: text("selected_plan_key"),
  status: text("status").notNull().default("verification_pending"),
  provisionedUserId: uuid("provisioned_user_id").references(() => users.id, { onDelete: "restrict" }),
  provisionedTenantId: uuid("provisioned_tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  provisionedAt: timestamp("provisioned_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const products = catalogSchema.table("products", {
  productKey: text("product_key").primaryKey(),
  publicName: text("public_name").notNull(),
  displayOrder: smallint("display_order").notNull(),
  status: text("status").notNull(),
  createdAt: createdAt(),
});

export const plans = catalogSchema.table("plans", {
  id: uuid("id").primaryKey().defaultRandom(),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  planKey: text("plan_key").notNull().unique(),
  publicName: text("public_name").notNull(),
  tierName: text("tier_name").notNull(),
  tierRank: smallint("tier_rank").notNull(),
  status: text("status").notNull(),
  createdAt: createdAt(),
});

export const planVersions = catalogSchema.table("plan_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "restrict" }),
  version: integer("version").notNull(),
  status: text("status").notNull(),
  currency: text("currency").notNull(),
  recurringAmountMinor: bigint("recurring_amount_minor", { mode: "number" }),
  billingInterval: text("billing_interval"),
  sellable: boolean("sellable").notNull().default(false),
  trialPolicy: jsonb("trial_policy").notNull().default({}),
  entitlements: jsonb("entitlements").notNull(),
  allowances: jsonb("allowances").notNull(),
  overageRatesMinor: jsonb("overage_rates_minor").notNull(),
  limits: jsonb("limits").notNull(),
  publicCopy: jsonb("public_copy").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdByPlatformUserId: uuid("created_by_platform_user_id"),
  createdAt: createdAt(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
});

export const meterVersions = catalogSchema.table("meter_versions", {
  meterKey: text("meter_key").notNull(),
  version: integer("version").notNull(),
  customerUnit: text("customer_unit").notNull(),
  definitionJson: jsonb("definition_json").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [primaryKey({ columns: [table.meterKey, table.version] })]);

export const catalogVersions = catalogSchema.table("catalog_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionKey: text("version_key").notNull().unique(),
  status: text("status").notNull(),
  currency: text("currency").notNull(),
  contentSha256: bytea("content_sha256").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
  createdByPlatformUserId: uuid("created_by_platform_user_id"),
  approvedByPlatformUserId: uuid("approved_by_platform_user_id"),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const catalogPromotions = catalogSchema.table("promotions", {
  catalogVersionId: uuid("catalog_version_id").notNull().references(() => catalogVersions.id, { onDelete: "restrict" }),
  promotionKey: text("promotion_key").notNull(),
  publicName: text("public_name").notNull(),
  eligibility: text("eligibility").notNull(),
  applicationMethod: text("application_method").notNull(),
  termCount: smallint("term_count").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveTo: timestamp("effective_to", { withTimezone: true }),
}, (table) => [primaryKey({ columns: [table.catalogVersionId, table.promotionKey] })]);

export const planCommercialTerms = catalogSchema.table("plan_commercial_terms", {
  catalogVersionId: uuid("catalog_version_id").notNull().references(() => catalogVersions.id, { onDelete: "restrict" }),
  planVersionId: uuid("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  promotionKey: text("promotion_key").notNull(),
  firstTermAmountMinor: bigint("first_term_amount_minor", { mode: "number" }).notNull(),
  renewalAmountMinor: bigint("renewal_amount_minor", { mode: "number" }).notNull(),
  firstTermDiscountMinor: bigint("first_term_discount_minor", { mode: "number" }).notNull(),
  billingInterval: text("billing_interval").notNull(),
  billingIntervalCount: smallint("billing_interval_count").notNull(),
  allowancePeriodTimezone: text("allowance_period_timezone").notNull(),
  allowancePeriodInterval: text("allowance_period_interval").notNull(),
  allowanceRollover: boolean("allowance_rollover").notNull().default(false),
  sellable: boolean("sellable").notNull().default(false),
}, (table) => [primaryKey({ columns: [table.catalogVersionId, table.planVersionId] })]);

export const productSubscriptions = tenancySchema.table("product_subscriptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  planVersionId: uuid("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  cancelAt: timestamp("cancel_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const tenantSecurityPolicies = tenancySchema.table("security_policies", {
  tenantId: uuid("tenant_id").primaryKey().references(() => tenants.id, { onDelete: "restrict" }),
  sensitiveActionsRequireMfa: boolean("sensitive_actions_require_mfa").notNull().default(true),
  tenantAdminMfaRequired: boolean("tenant_admin_mfa_required").notNull().default(false),
  assuranceMaxAgeSeconds: integer("assurance_max_age_seconds").notNull().default(600),
  approvedPolicyRef: text("approved_policy_ref"),
  updatedByUserId: uuid("updated_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: updatedAt(),
});

export const subscriptionAddOns = tenancySchema.table("subscription_add_ons", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  addOnKey: text("add_on_key").notNull(),
  quantity: integer("quantity").notNull(),
  status: text("status").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  effectiveUntil: timestamp("effective_until", { withTimezone: true }),
  providerItemRef: text("provider_item_ref"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const subscriptionScheduledChanges = tenancySchema.table("subscription_scheduled_changes", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  fromPlanVersionId: uuid("from_plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  toPlanVersionId: uuid("to_plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  effectiveAt: timestamp("effective_at", { withTimezone: true }).notNull(),
  retainedResourceSelection: jsonb("retained_resource_selection").notNull().default({}),
  status: text("status").notNull(),
  requestedByUserId: uuid("requested_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  requestedByMembershipId: uuid("requested_by_membership_id").notNull().references(() => memberships.id, { onDelete: "restrict" }),
  requestId: text("request_id").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
  failureCode: text("failure_code"),
});

export const entitlementResourceStates = tenancySchema.table("entitlement_resource_states", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  resourceKind: text("resource_kind").notNull(),
  resourceId: uuid("resource_id").notNull(),
  state: text("state").notNull(),
  sourceChangeId: uuid("source_change_id").references(() => subscriptionScheduledChanges.id, { onDelete: "restrict" }),
  reasonCode: text("reason_code").notNull(),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  restoredAt: timestamp("restored_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const downgradePreflightEvidence = tenancySchema.table("downgrade_preflight_evidence", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  destinationPlanVersionId: uuid("destination_plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  currentResourceCounts: jsonb("current_resource_counts").notNull(),
  destinationLimits: jsonb("destination_limits").notNull(),
  blockers: jsonb("blockers").notNull(),
  requiredSelection: jsonb("required_selection").notNull(),
  contentHash: bytea("content_hash").notNull(),
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const subscriptionContractSnapshots = tenancySchema.table("subscription_contract_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  catalogVersionId: uuid("catalog_version_id").notNull().references(() => catalogVersions.id, { onDelete: "restrict" }),
  planVersionId: uuid("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  contractJson: jsonb("contract_json").notNull(),
  contractSha256: bytea("contract_sha256").notNull(),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("subscription_contract_tenant_subscription_unique").on(table.tenantId, table.subscriptionId)]);

export const entitlementOverrides = tenancySchema.table("entitlement_overrides", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  entitlementKey: text("entitlement_key").notNull(),
  valueJson: jsonb("value_json").notNull(),
  reason: text("reason").notNull(),
  approvedByPlatformUserId: uuid("approved_by_platform_user_id").notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const entitlementSnapshots = tenancySchema.table("entitlement_snapshots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  planVersionId: uuid("plan_version_id").notNull().references(() => planVersions.id, { onDelete: "restrict" }),
  subscriptionStatus: text("subscription_status").notNull(),
  accessMode: text("access_mode").notNull(),
  resolvedJson: jsonb("resolved_json").notNull(),
  resolutionHash: bytea("resolution_hash").notNull(),
  createdAt: createdAt(),
});

export const quotaAccounts = tenancySchema.table("quota_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  customerUnit: text("customer_unit").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  includedQuantity: numeric("included_quantity", { mode: "number" }),
  safetyCapQuantity: numeric("safety_cap_quantity", { mode: "number" }),
  reservedQuantity: numeric("reserved_quantity", { mode: "number" }).notNull().default(0),
  settledQuantity: numeric("settled_quantity", { mode: "number" }).notNull().default(0),
  overageConsentStatus: text("overage_consent_status").notNull().default("none"),
  overageConsentedAt: timestamp("overage_consented_at", { withTimezone: true }),
  overageConsentedByUserId: uuid("overage_consented_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  updatedAt: updatedAt(),
});

export const usageReservations = tenancySchema.table("usage_reservations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  quotaAccountId: uuid("quota_account_id").notNull().references(() => quotaAccounts.id, { onDelete: "restrict" }),
  entitlementSnapshotId: uuid("entitlement_snapshot_id").notNull().references(() => entitlementSnapshots.id, { onDelete: "restrict" }),
  operationId: text("operation_id").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  requestedQuantity: numeric("requested_quantity", { mode: "number" }).notNull(),
  reservedQuantity: numeric("reserved_quantity", { mode: "number" }).notNull(),
  settledQuantity: numeric("settled_quantity", { mode: "number" }),
  status: text("status").notNull(),
  reasonCode: text("reason_code"),
  fundingJson: jsonb("funding_json").notNull().default({ included: 0, packs: 0, overage: 0 }),
  createdAt: createdAt(),
  settledAt: timestamp("settled_at", { withTimezone: true }),
});

export const usageEvents = tenancySchema.table("usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  entitlementSnapshotId: uuid("entitlement_snapshot_id").notNull().references(() => entitlementSnapshots.id, { onDelete: "restrict" }),
  reservationId: uuid("reservation_id").references(() => usageReservations.id, { onDelete: "restrict" }),
  productKey: text("product_key").notNull().references(() => products.productKey, { onDelete: "restrict" }),
  operationId: text("operation_id").notNull(),
  eventType: text("event_type").notNull(),
  customerUnit: text("customer_unit").notNull(),
  customerQuantity: numeric("customer_quantity", { mode: "number" }).notNull(),
  rateMinor: numeric("rate_minor", { mode: "number" }),
  billableAmountMinor: bigint("billable_amount_minor", { mode: "number" }),
  idempotencyKey: text("idempotency_key").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

export const usagePackLots = tenancySchema.table("usage_pack_lots", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  customerUnit: text("customer_unit").notNull(),
  packKey: text("pack_key").notNull(),
  purchasedQuantity: numeric("purchased_quantity", { mode: "number" }).notNull(),
  effectiveFrom: timestamp("effective_from", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  providerLineItemRef: text("provider_line_item_ref"),
  status: text("status").notNull(),
  createdAt: createdAt(),
});

export const usagePackConsumptions = tenancySchema.table("usage_pack_consumptions", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  packLotId: uuid("pack_lot_id").notNull().references(() => usagePackLots.id, { onDelete: "restrict" }),
  reservationId: uuid("reservation_id").notNull().references(() => usageReservations.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  quantity: numeric("quantity", { mode: "number" }).notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: createdAt(),
});

export const usageAlertPreferences = tenancySchema.table("usage_alert_preferences", {
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  quotaAccountId: uuid("quota_account_id").notNull().references(() => quotaAccounts.id, { onDelete: "restrict" }),
  thresholds: smallint("thresholds").array().notNull().default([50, 75, 90, 100]),
  exhaustionAlert: boolean("exhaustion_alert").notNull().default(true),
  anomalyAlert: boolean("anomaly_alert").notNull().default(true),
  cooldownHours: integer("cooldown_hours").notNull().default(24),
  notificationProfileId: uuid("notification_profile_id"),
  updatedByUserId: uuid("updated_by_user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  updatedAt: updatedAt(),
}, (table) => [primaryKey({ columns: [table.tenantId, table.quotaAccountId] })]);

export const usageAlertDeliveries = tenancySchema.table("usage_alert_deliveries", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  quotaAccountId: uuid("quota_account_id").notNull().references(() => quotaAccounts.id, { onDelete: "restrict" }),
  alertKey: text("alert_key").notNull(),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
  forecastJson: jsonb("forecast_json").notNull(),
  deliveryStatus: text("delivery_status").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  createdAt: createdAt(),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
});

export const usageAlertDeliveryAttempts = tenancySchema.table("usage_alert_delivery_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  alertDeliveryId: uuid("alert_delivery_id").notNull().references(() => usageAlertDeliveries.id, { onDelete: "restrict" }),
  tenantOutboxId: uuid("tenant_outbox_id").notNull(),
  attemptNumber: integer("attempt_number").notNull(),
  outcome: text("outcome").notNull(),
  safeErrorCode: text("safe_error_code"),
  attemptedAt: timestamp("attempted_at", { withTimezone: true }).notNull(),
});

export const providerUsageEvents = tenancySchema.table("provider_usage_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  subscriptionId: uuid("subscription_id").notNull().references(() => productSubscriptions.id, { onDelete: "restrict" }),
  providerKey: text("provider_key").notNull(),
  providerMeterKey: text("provider_meter_key").notNull(),
  sourceEventId: text("source_event_id").notNull(),
  nativeQuantity: numeric("native_quantity", { mode: "number" }).notNull(),
  nativeUnit: text("native_unit").notNull(),
  estimatedCostMinor: numeric("estimated_cost_minor", { mode: "number" }),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  reconciliationStatus: text("reconciliation_status").notNull().default("pending"),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
});

export const providerUsageReconciliationResults = tenancySchema.table("provider_usage_reconciliation_results", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  providerUsageEventId: uuid("provider_usage_event_id").notNull().references(() => providerUsageEvents.id, { onDelete: "restrict" }),
  customerUsageEventId: uuid("customer_usage_event_id").references(() => usageEvents.id, { onDelete: "restrict" }),
  status: text("status").notNull(),
  evidenceJson: jsonb("evidence_json").notNull(),
  reconciledAt: timestamp("reconciled_at", { withTimezone: true }).notNull(),
});

export const usageReconciliationCases = platformSchema.table("usage_reconciliation_cases", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  reconciliationResultId: uuid("reconciliation_result_id").notNull(),
  requestedAction: text("requested_action").notNull(),
  reason: text("reason").notNull(),
  requestedByPlatformUserId: uuid("requested_by_platform_user_id").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
});

export const usageReconciliationCaseEvents = platformSchema.table("usage_reconciliation_case_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  caseId: uuid("case_id").notNull().references(() => usageReconciliationCases.id, { onDelete: "restrict" }),
  eventType: text("event_type").notNull(),
  actorPlatformUserId: uuid("actor_platform_user_id").notNull(),
  safeNote: text("safe_note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
});

export const paymentCustomers = billingSchema.table("payment_customers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  providerKey: text("provider_key").notNull(),
  externalCustomerRef: text("external_customer_ref").notNull(),
  createdAt: createdAt(),
});

export const billingWebhookEvents = billingSchema.table("webhook_events", {
  id: uuid("id").primaryKey().defaultRandom(),
  providerKey: text("provider_key").notNull(),
  externalEventId: text("external_event_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
  payloadHash: bytea("payload_hash").notNull(),
  payloadCiphertext: text("payload_ciphertext").notNull(),
  status: text("status").notNull(),
  attemptCount: integer("attempt_count").notNull().default(0),
  lastErrorCode: text("last_error_code"),
  appliedAt: timestamp("applied_at", { withTimezone: true }),
});

export const oneTimeTokens = identitySchema.table("one_time_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  tokenHash: bytea("token_hash").notNull().unique(),
  purpose: text("purpose").notNull(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "cascade" }),
  signupIntentId: uuid("signup_intent_id").references(() => signupIntents.id, { onDelete: "cascade" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const legalAcceptances = identitySchema.table("legal_acceptances", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "restrict" }),
  tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "restrict" }),
  documentType: text("document_type").notNull(),
  documentVersion: text("document_version").notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }).notNull().defaultNow(),
  requestId: text("request_id").notNull(),
});

export const authSessions = identitySchema.table("auth_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  familyId: uuid("family_id").notNull(),
  selectedTenantId: uuid("selected_tenant_id").references(() => tenants.id, { onDelete: "set null" }),
  reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }).notNull().defaultNow(),
  mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  rotatedAt: timestamp("rotated_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokeReason: text("revoke_reason"),
});

export const authLoginChallenges = identitySchema.table("auth_login_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  passwordVerifiedAt: timestamp("password_verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const mfaRecoveryCodes = identitySchema.table("mfa_recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  codeHash: bytea("code_hash").notNull().unique(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const mfaFactors = identitySchema.table("mfa_factors", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  factorType: text("factor_type").notNull(),
  label: text("label").notNull(),
  secretCiphertext: bytea("secret_ciphertext"),
  credentialData: jsonb("credential_data"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const membershipInvitations = tenancySchema.table("membership_invitations", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  emailNormalized: text("email_normalized").notNull(),
  role: text("role").notNull(),
  status: text("status").notNull().default("pending"),
  invitedByMembershipId: uuid("invited_by_membership_id").notNull(),
  tokenId: uuid("token_id").notNull().unique().references(() => oneTimeTokens.id, { onDelete: "restrict" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedByUserId: uuid("accepted_by_user_id").references(() => users.id, { onDelete: "restrict" }),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const ownershipTransfers = tenancySchema.table("ownership_transfers", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  fromMembershipId: uuid("from_membership_id").notNull(),
  toMembershipId: uuid("to_membership_id").notNull(),
  tokenId: uuid("token_id").unique().references(() => oneTimeTokens.id, { onDelete: "restrict" }),
  status: text("status").notNull().default("pending"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  acceptedAt: timestamp("accepted_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const tenantAuditLogs = tenancySchema.table("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "restrict" }),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  actorMembershipId: uuid("actor_membership_id"),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  requestId: text("request_id").notNull(),
  reason: text("reason"),
  result: text("result").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
}, (table) => [index("tenancy_audit_logs_recent").on(table.tenantId, table.createdAt)]);

export const tenantOutbox = tenancySchema.table("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenants.id, { onDelete: "cascade" }),
  topic: text("topic").notNull(),
  payload: jsonb("payload").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  createdAt: createdAt(),
});

export const operationsOutbox = operationsSchema.table("outbox", {
  id: uuid("id").primaryKey().defaultRandom(),
  topic: text("topic").notNull(),
  aggregateType: text("aggregate_type").notNull(),
  aggregateId: uuid("aggregate_id").notNull(),
  payloadCiphertext: text("payload_ciphertext").notNull(),
  idempotencyKey: text("idempotency_key").notNull(),
  status: text("status").notNull().default("pending"),
  attemptCount: integer("attempt_count").notNull().default(0),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull().defaultNow(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  lastErrorCode: text("last_error_code"),
  createdAt: createdAt(),
});

export const operationsAuditLogs = operationsSchema.table("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorUserId: uuid("actor_user_id").references(() => users.id, { onDelete: "restrict" }),
  realm: text("realm").notNull(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  requestId: text("request_id").notNull(),
  result: text("result").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
});

export const operationsRateLimits = operationsSchema.table("rate_limits", {
  scope: text("scope").notNull(),
  keyHash: bytea("key_hash").notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).notNull(),
  attemptCount: integer("attempt_count").notNull(),
  blockedUntil: timestamp("blocked_until", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const platformUsers = platformSchema.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  emailNormalized: text("email_normalized").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  status: text("status").notNull().default("pending_mfa"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const platformRoleAssignments = platformSchema.table("role_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformUserId: uuid("platform_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  grantedByUserId: uuid("granted_by_user_id").references(() => platformUsers.id, { onDelete: "restrict" }),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

export const platformMfaFactors = platformSchema.table("mfa_factors", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformUserId: uuid("platform_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  factorType: text("factor_type").notNull(),
  label: text("label").notNull(),
  secretCiphertext: bytea("secret_ciphertext"),
  credentialData: jsonb("credential_data"),
  verifiedAt: timestamp("verified_at", { withTimezone: true }),
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const platformSessions = platformSchema.table("sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformUserId: uuid("platform_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  familyId: uuid("family_id").notNull(),
  mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }).notNull(),
  reauthenticatedAt: timestamp("reauthenticated_at", { withTimezone: true }),
  createdAt: createdAt(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  idleExpiresAt: timestamp("idle_expires_at", { withTimezone: true }).notNull(),
  absoluteExpiresAt: timestamp("absolute_expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  revokeReason: text("revoke_reason"),
});

export const platformBootstrapState = platformSchema.table("bootstrap_state", {
  singleton: boolean("singleton").primaryKey().default(true),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  completedByUserId: uuid("completed_by_user_id").references(() => platformUsers.id, { onDelete: "restrict" }),
});

export const platformLoginChallenges = platformSchema.table("login_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformUserId: uuid("platform_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  tokenHash: bytea("token_hash").notNull().unique(),
  passwordVerifiedAt: timestamp("password_verified_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  consumedAt: timestamp("consumed_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const platformMfaRecoveryCodes = platformSchema.table("mfa_recovery_codes", {
  id: uuid("id").primaryKey().defaultRandom(),
  platformUserId: uuid("platform_user_id").notNull().references(() => platformUsers.id, { onDelete: "cascade" }),
  codeHash: bytea("code_hash").notNull().unique(),
  usedAt: timestamp("used_at", { withTimezone: true }),
  createdAt: createdAt(),
});

export const platformAuditLogs = platformSchema.table("audit_logs", {
  id: uuid("id").primaryKey().defaultRandom(),
  actorPlatformUserId: uuid("actor_platform_user_id").references(() => platformUsers.id, { onDelete: "restrict" }),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id"),
  requestId: text("request_id").notNull(),
  reason: text("reason"),
  result: text("result").notNull(),
  metadata: jsonb("metadata").notNull().default({}),
  createdAt: createdAt(),
});
