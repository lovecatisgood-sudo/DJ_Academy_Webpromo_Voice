import type { TenantContext } from "@djay/tenancy";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

const fixedTrialDurationMs = 30 * 24 * 60 * 60 * 1000;

export class TrialStore {
  constructor(private readonly client: DatabaseClient) {}

  async activateFlowStarter(context: TenantContext, input: Readonly<{
    purchaseIntentId: string;
    trialGrantId: string;
    entitlementSnapshotId: string;
    idempotencyKey: string;
    now?: Date;
  }>) {
    const now = input.now ?? new Date();
    const expiresAt = new Date(now.getTime() + fixedTrialDurationMs);
    return withTenantTransaction(this.client, context, async ({ sql }) => {
      const replay = await sql<{ id: string; starts_at: Date; expires_at: Date }[]>`
        SELECT id, starts_at, expires_at
        FROM billing.trial_grants
        WHERE tenant_id = ${context.tenantId}::uuid
          AND (purchase_intent_id = ${input.purchaseIntentId}::uuid
            OR idempotency_key = ${input.idempotencyKey})
        LIMIT 1
      `;
      if (replay[0]) return {
        status: "activated" as const,
        trialGrantId: replay[0].id,
        startsAt: replay[0].starts_at,
        expiresAt: replay[0].expires_at,
        replayed: true,
      };

      const rows = await sql<{
        subscription_id: string;
        plan_version_id: string;
        eligibility_subject_hash: Buffer;
        entitlements: Record<string, boolean | string | number | null>;
        limits: Record<string, number | null>;
      }[]>`
        SELECT subscription.id AS subscription_id, intent.plan_version_id,
          billing.current_tenant_verified_owner_email_hash() AS eligibility_subject_hash,
          version.entitlements, version.limits
        FROM billing.purchase_intents intent
        JOIN catalog.plan_versions version ON version.id = intent.plan_version_id
        JOIN catalog.plans plan ON plan.id = version.plan_id
        JOIN tenancy.product_subscriptions subscription
          ON subscription.tenant_id = intent.tenant_id
          AND subscription.plan_version_id = intent.plan_version_id
          AND subscription.status = 'pending'
        JOIN tenancy.tenant_onboarding onboarding ON onboarding.tenant_id = intent.tenant_id
        WHERE intent.id = ${input.purchaseIntentId}::uuid
          AND intent.tenant_id = ${context.tenantId}::uuid
          AND intent.commerce_intent = 'trial'
          AND intent.status = 'open'
          AND intent.expires_at > ${now}
          AND plan.plan_key = 'flowbot_basic'
          AND plan.product_key = 'flowbot'
          AND onboarding.merchant_onboarding_version > 0
          AND onboarding.guidelines_accepted_at IS NOT NULL
          AND onboarding.preferences_completed_at IS NOT NULL
          AND billing.current_tenant_verified_owner_email_hash() IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM tenancy.builder_draft_claims claim
            WHERE claim.tenant_id = intent.tenant_id
              AND claim.plan_key = 'flowbot_basic'
              AND claim.product_family = 'flow'
              AND claim.state_json #>> '{configuration,flowUi,configured}' = 'true'
              AND COALESCE((claim.state_json #>> '{configuration,flowUi,version}')::integer, 0) > 0
          )
        LIMIT 1
        FOR UPDATE OF intent, subscription
      `;
      const authority = rows[0];
      if (!authority) return { status: "not_eligible" as const };

      const subjectHash = authority.eligibility_subject_hash;
      const alreadyUsed = await sql<{ id: string }[]>`
        SELECT id FROM billing.trial_grants
        WHERE eligibility_subject_kind = 'verified_email'
          AND eligibility_subject_hash = ${subjectHash}
          AND product_key = 'flowbot'
        LIMIT 1
      `;
      if (alreadyUsed[0]) return { status: "already_used" as const };

      const trialEntitlements = {
        ...authority.entitlements,
        "channel.web": true,
        "channel.social": false,
        "flow.nodes.advanced": false,
        "flow.webhook": false,
        "integration.google_sheets": false,
        "integration.external_api": false,
        "branding.remove": false,
      };
      const resolved = {
        tenantId: context.tenantId,
        subscriptionId: authority.subscription_id,
        productKey: "flowbot",
        publicPlanKey: "flowbot_basic",
        planVersionId: authority.plan_version_id,
        accessMode: "active",
        entitlements: trialEntitlements,
        allowances: { flow_execution: 5000 },
        overageRatesMinor: { flow_execution: null },
        limits: { ...authority.limits, social_channels: 0 },
        trial: { grantId: input.trialGrantId, startsAt: now.toISOString(), expiresAt: expiresAt.toISOString(), channelScope: ["website"] },
        resolvedAt: now.toISOString(),
      };
      const serialized = JSON.stringify(resolved);

      const inserted = await sql<{ id: string }[]>`
        INSERT INTO billing.trial_grants (
          id, tenant_id, purchase_intent_id, subscription_id, plan_version_id,
          product_key, eligibility_subject_kind, eligibility_subject_hash,
          starts_at, expires_at, allowance_unit, allowance_quantity,
          idempotency_key, activated_by_user_id, activated_by_membership_id
        ) VALUES (
          ${input.trialGrantId}::uuid, ${context.tenantId}::uuid,
          ${input.purchaseIntentId}::uuid, ${authority.subscription_id}::uuid,
          ${authority.plan_version_id}::uuid, 'flowbot', 'verified_email', ${subjectHash},
          ${now}, ${expiresAt}, 'flow_conversation_started', 5000,
          ${input.idempotencyKey}, ${context.userId}::uuid, ${context.membershipId}::uuid
        )
        ON CONFLICT DO NOTHING
        RETURNING id
      `;
      if (!inserted[0]) return { status: "already_used" as const };

      const subscriptions = await sql<{ id: string }[]>`
        UPDATE tenancy.product_subscriptions
        SET status = 'trialing', period_start = ${now}, period_end = ${expiresAt}, updated_at = ${now}
        WHERE tenant_id = ${context.tenantId}::uuid
          AND id = ${authority.subscription_id}::uuid AND status = 'pending'
        RETURNING id
      `;
      if (!subscriptions[0]) throw new Error("trial_subscription_transition_failed");
      const quotas = await sql<{ id: string }[]>`
        UPDATE tenancy.quota_accounts
        SET period_start = ${now}, period_end = ${expiresAt}, included_quantity = 5000,
            safety_cap_quantity = 5000, updated_at = ${now}
        WHERE tenant_id = ${context.tenantId}::uuid
          AND subscription_id = ${authority.subscription_id}::uuid
          AND customer_unit = 'flow_execution'
          AND reserved_quantity = 0 AND settled_quantity = 0
        RETURNING id
      `;
      if (!quotas[0]) throw new Error("trial_quota_activation_failed");
      await sql`
        INSERT INTO tenancy.entitlement_snapshots (
          id, tenant_id, subscription_id, product_key, plan_version_id,
          subscription_status, access_mode, resolved_json, resolution_hash
        ) VALUES (
          ${input.entitlementSnapshotId}::uuid, ${context.tenantId}::uuid,
          ${authority.subscription_id}::uuid, 'flowbot', ${authority.plan_version_id}::uuid,
          'trialing', 'active', ${sql.json(resolved)},
          digest(convert_to(${serialized}, 'UTF8'), 'sha256')
        )
      `;
      await sql`
        UPDATE billing.purchase_intents
        SET status = 'trial_activated', consumed_at = ${now},
            activated_trial_grant_id = ${input.trialGrantId}::uuid
        WHERE id = ${input.purchaseIntentId}::uuid
          AND tenant_id = ${context.tenantId}::uuid AND status = 'open'
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${context.tenantId}::uuid, ${context.userId}::uuid, ${context.membershipId}::uuid,
          'trial.flow_starter_activated', 'trial_grant', ${input.trialGrantId},
          ${context.requestId}, 'succeeded',
          ${sql.json({ planKey: "flowbot_basic", allowance: 5000, unit: "flow_conversation_started", channelScope: ["website"] })}
        )
      `;
      await sql`
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (
          ${context.tenantId}::uuid, 'trial.flow_starter_activated',
          ${sql.json({ trialGrantId: input.trialGrantId, subscriptionId: authority.subscription_id, startsAt: now.toISOString(), expiresAt: expiresAt.toISOString() })},
          ${`flow-trial-activated:${input.trialGrantId}`}
        )
      `;
      return { status: "activated" as const, trialGrantId: input.trialGrantId, startsAt: now, expiresAt, replayed: false };
    });
  }
}
