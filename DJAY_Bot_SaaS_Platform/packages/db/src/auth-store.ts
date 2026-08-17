import {
  secureBufferEquals,
  type AuthStore,
  type AcceptTenantInvitationCommand,
  type AcceptOwnershipTransferCommand,
  type CancelOwnershipTransferCommand,
  type CompleteMfaEnrollmentCommand,
  type CompleteTenantMfaLoginCommand,
  type CompleteRecoveryCommand,
  type ConsumeRateLimitCommand,
  type CreateRecoveryIntentCommand,
  type CreateSessionCommand,
  type CreateSignupIntentCommand,
  type CreateTenantInvitationCommand,
  type CreateOwnershipTransferCommand,
  type CreateMfaEnrollmentCommand,
  type CreateTenantLoginChallengeCommand,
  type ProvisionSignupCommand,
  type RevokeUserSessionCommand,
  type RotateWorkspaceSessionCommand,
  type ResendVerificationCommand,
} from "@djay/auth";
import type { TenantRole } from "@djay/authorization";
import type { InvitationRole } from "@djay/auth";
import type { DatabaseClient } from "./client";

type SignupRow = {
  id: string;
  request_hash: Buffer;
};

type VerificationRow = {
  token_id: string;
  consumed_at: Date | null;
  expires_at: Date;
  intent_id: string;
  intent_status: string;
  email_normalized: string;
  display_name: string;
  business_name: string;
  password_hash: string | null;
  locale: "en" | "th";
  timezone: string;
  terms_version: string;
  privacy_version: string;
  selected_plan_key: import("@djay/shared").PublicPlanKey | null;
  provisioned_user_id: string | null;
  provisioned_tenant_id: string | null;
};

type BuilderClaimRow = {
  session_id: string;
  session_status: "active" | "claimed" | "expired";
  session_expires_at: Date;
  draft_id: string;
  draft_status: "active" | "claimed" | "expired";
  draft_expires_at: Date;
  revision: number;
  schema_version: number;
  product_family: "flow" | "text" | "voice" | null;
  plan_key: string | null;
  state_json: unknown;
};

function slugForBusiness(businessName: string, tenantId: string): string {
  const base = businessName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 45) || "workspace";
  return `${base}-${tenantId.replaceAll("-", "").slice(0, 8)}`;
}

export class PostgresAuthStore implements AuthStore {
  constructor(private readonly client: DatabaseClient) {}

  async createSignupIntent(command: CreateSignupIntentCommand) {
    return this.client.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${command.emailNormalized}, 0))`;

      let builderDraftId: string | null = null;
      let builderPendingRegistrationId: string | null = null;
      let builderCommerceIntent: "subscribe" | "trial" = "subscribe";
      if (command.builderSessionId) {
        const drafts = await sql<{ draft_id: string; pending_registration_id: string | null; commerce_intent: "subscribe" | "trial" }[]>`
          SELECT draft.id AS draft_id, session.pending_registration_id,
            COALESCE(draft.state_json #>> '{access,intent}', 'subscribe') AS commerce_intent
          FROM builder.anonymous_sessions session
          JOIN builder.drafts draft ON draft.session_id = session.id
          WHERE session.id = ${command.builderSessionId}::uuid
            AND session.status = 'active'
            AND session.expires_at > now()
            AND draft.status = 'active'
            AND draft.expires_at > now()
            AND draft.product_family IS NOT NULL
            AND draft.plan_key IS NOT NULL
            AND draft.plan_key = ${command.selectedPlanKey ?? null}
            AND COALESCE(draft.state_json #>> '{access,intent}', 'subscribe') IN ('subscribe', 'trial')
            AND (COALESCE(draft.state_json #>> '{access,intent}', 'subscribe') <> 'trial'
              OR draft.plan_key IN ('flowbot_basic', 'ai_chat_basic'))
          FOR UPDATE OF session, draft
        `;
        builderDraftId = drafts[0]?.draft_id ?? null;
        builderPendingRegistrationId = drafts[0]?.pending_registration_id ?? null;
        builderCommerceIntent = drafts[0]?.commerce_intent ?? "subscribe";
        if (!builderDraftId) return { status: "builder_draft_unavailable" as const };
      }

      const matchingKey = await sql<SignupRow[]>`
        SELECT id, request_hash
        FROM identity.signup_intents
        WHERE idempotency_key = ${command.idempotencyKey}::uuid
        FOR UPDATE
      `;
      const existingByKey = matchingKey[0];
      if (existingByKey) {
        if (command.builderSessionId) {
          const linked = await sql<{ linked: boolean }[]>`
            SELECT EXISTS (
              SELECT 1 FROM builder.anonymous_sessions
              WHERE id = ${command.builderSessionId}::uuid
                AND (pending_registration_id = ${existingByKey.id}::uuid OR claimed_registration_id = ${existingByKey.id}::uuid)
            ) AS linked
          `;
          if (!linked[0]?.linked) return { status: "idempotency_conflict" as const };
        }
        return secureBufferEquals(existingByKey.request_hash, command.requestHash)
          ? { status: "replayed" as const, intentId: existingByKey.id }
          : { status: "idempotency_conflict" as const };
      }
      if (builderPendingRegistrationId) return { status: "builder_draft_unavailable" as const };

      const pendingEmail = await sql<{ id: string }[]>`
        SELECT id
        FROM identity.signup_intents
        WHERE email_normalized = ${command.emailNormalized}
          AND status IN ('verification_pending', 'provisioning')
        LIMIT 1
        FOR UPDATE
      `;
      if (pendingEmail[0]) return { status: "email_already_pending" as const };

      await sql`
        INSERT INTO identity.signup_intents (
          id, idempotency_key, request_hash, email_normalized, display_name,
          business_name, password_hash, locale, timezone, terms_version,
          privacy_version, selected_plan_key, status, expires_at
        ) VALUES (
          ${command.intentId}::uuid, ${command.idempotencyKey}::uuid, ${command.requestHash},
          ${command.emailNormalized}, ${command.displayName}, ${command.businessName},
          ${command.passwordHash}, ${command.locale}, ${command.timezone},
          ${command.termsVersion}, ${command.privacyVersion}, ${command.selectedPlanKey ?? null}, 'verification_pending',
          ${command.tokenExpiresAt}
        )
      `;
      await sql`
        INSERT INTO identity.one_time_tokens (
          id, token_hash, purpose, signup_intent_id, expires_at
        ) VALUES (
          ${command.tokenId}::uuid, ${command.tokenHash}, 'verify_email',
          ${command.intentId}::uuid, ${command.tokenExpiresAt}
        )
      `;
      await sql`
        INSERT INTO operations.outbox (
          topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key
        ) VALUES (
          'auth.verify_email', 'signup_intent', ${command.intentId}::uuid,
          ${command.outboxPayloadCiphertext}, ${`verify:${command.intentId}`}
        )
      `;

      if (command.builderSessionId && builderDraftId) {
        const linked = await sql<{ id: string }[]>`
          UPDATE builder.anonymous_sessions
          SET pending_registration_id = ${command.intentId}::uuid,
              last_seen_at = now()
          WHERE id = ${command.builderSessionId}::uuid
            AND status = 'active'
            AND pending_registration_id IS NULL
          RETURNING id
        `;
        if (!linked[0]) throw new Error("builder_draft_link_conflict");
      }

      if (command.selectedPlanKey) {
        const planRows = await sql<{ plan_version_id: string }[]>`
          SELECT version.id AS plan_version_id
          FROM catalog.catalog_versions catalog_version
          JOIN catalog.plan_commercial_terms terms ON terms.catalog_version_id = catalog_version.id
          JOIN catalog.plan_versions version ON version.id = terms.plan_version_id
          JOIN catalog.plans plan ON plan.id = version.plan_id
          WHERE plan.plan_key = ${command.selectedPlanKey}
            AND plan.status = 'active'
            AND catalog_version.status = 'active'
            AND catalog_version.effective_from <= ${command.tokenExpiresAt}
            AND (catalog_version.effective_to IS NULL OR catalog_version.effective_to > ${command.tokenExpiresAt})
            AND version.status = 'published'
            AND version.effective_from <= ${command.tokenExpiresAt}
            AND (version.effective_to IS NULL OR version.effective_to > ${command.tokenExpiresAt})
          ORDER BY version.version DESC
          LIMIT 1
        `;
        const planVersionId = planRows[0]?.plan_version_id;
        if (!planVersionId) throw new Error("selected_plan_version_unavailable");
        const purchaseExpiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000);
        await sql`
          INSERT INTO billing.purchase_intents (
            id, registration_id, tenant_id, plan_key, plan_version_id,
            commerce_intent, status, created_at, expires_at
          ) VALUES (
            gen_random_uuid(), ${command.intentId}::uuid, NULL,
            ${command.selectedPlanKey}, ${planVersionId}::uuid,
            ${builderCommerceIntent}, 'open', now(), ${purchaseExpiresAt}
          )
        `;
      }

      return { status: "created" as const, intentId: command.intentId };
    });
  }

  async provisionSignup(command: ProvisionSignupCommand) {
    return this.client.begin(async (sql) => {
      const rows = await sql<VerificationRow[]>`
        SELECT
          token.id AS token_id,
          token.consumed_at,
          token.expires_at,
          intent.id AS intent_id,
          intent.status AS intent_status,
          intent.email_normalized,
          intent.display_name,
          intent.business_name,
          intent.password_hash,
          intent.locale,
          intent.timezone,
          intent.terms_version,
          intent.privacy_version,
          intent.selected_plan_key,
          intent.provisioned_user_id,
          intent.provisioned_tenant_id
        FROM identity.one_time_tokens token
        JOIN identity.signup_intents intent ON intent.id = token.signup_intent_id
        WHERE token.token_hash = ${command.tokenHash}
          AND token.purpose = 'verify_email'
        FOR UPDATE OF token, intent
      `;
      const signup = rows[0];
      if (!signup) return { status: "invalid_or_expired" as const };

      if (signup.intent_status === "provisioned" && signup.provisioned_tenant_id && signup.provisioned_user_id) {
        return {
          status: "already_provisioned" as const,
          tenantId: signup.provisioned_tenant_id,
          userId: signup.provisioned_user_id,
        };
      }
      if (
        signup.consumed_at
        || signup.expires_at.getTime() <= command.now.getTime()
        || signup.intent_status !== "verification_pending"
        || !signup.password_hash
      ) {
        return { status: "invalid_or_expired" as const };
      }

      const builderClaims = await sql<BuilderClaimRow[]>`
        SELECT session.id AS session_id, session.status AS session_status,
          session.expires_at AS session_expires_at, draft.id AS draft_id,
          draft.status AS draft_status, draft.expires_at AS draft_expires_at,
          draft.revision, draft.schema_version, draft.product_family, draft.plan_key,
          draft.state_json
        FROM builder.anonymous_sessions session
        JOIN builder.drafts draft ON draft.session_id = session.id
        WHERE session.pending_registration_id = ${signup.intent_id}::uuid
        FOR UPDATE OF session, draft
      `;
      const builderClaim = builderClaims[0] ?? null;
      if (builderClaim && (
        builderClaim.session_status !== "active"
        || builderClaim.draft_status !== "active"
        || builderClaim.session_expires_at.getTime() <= command.now.getTime()
        || builderClaim.draft_expires_at.getTime() <= command.now.getTime()
        || !builderClaim.product_family
        || !builderClaim.plan_key
      )) return { status: "builder_draft_expired" as const };

      const existingEmail = await sql<{ user_id: string }[]>`
        SELECT user_id FROM identity.email_addresses
        WHERE email_normalized = ${signup.email_normalized}
        LIMIT 1
      `;
      if (existingEmail[0]) return { status: "invalid_or_expired" as const };

      await sql`
        SELECT
          set_config('app.tenant_id', ${command.tenantId}, true),
          set_config('app.user_id', ${command.userId}, true),
          set_config('app.membership_id', ${command.membershipId}, true),
          set_config('app.request_id', ${command.requestId}, true)
      `;
      await sql`
        INSERT INTO identity.users (id, display_name, status, locale)
        VALUES (${command.userId}::uuid, ${signup.display_name}, 'active', ${signup.locale})
      `;
      await sql`
        INSERT INTO identity.user_credentials (user_id, password_hash)
        VALUES (${command.userId}::uuid, ${signup.password_hash})
      `;
      await sql`
        INSERT INTO identity.email_addresses (
          id, user_id, email, email_normalized, is_primary, verified_at
        ) VALUES (
          ${command.emailId}::uuid, ${command.userId}::uuid, ${signup.email_normalized},
          ${signup.email_normalized}, true, ${command.now}
        )
      `;
      await sql`
        INSERT INTO tenancy.tenants (id, slug, business_name, status, locale, timezone)
        VALUES (
          ${command.tenantId}::uuid, ${slugForBusiness(signup.business_name, command.tenantId)},
          ${signup.business_name}, 'active', ${signup.locale}, ${signup.timezone}
        )
      `;
      await sql`
        INSERT INTO tenancy.memberships (
          id, tenant_id, user_id, role, status, accepted_at
        ) VALUES (
          ${command.membershipId}::uuid, ${command.tenantId}::uuid, ${command.userId}::uuid,
          'tenant_master_admin', 'active', ${command.now}
        )
      `;
      await sql`
        INSERT INTO tenancy.tenant_onboarding (tenant_id, stage)
        VALUES (${command.tenantId}::uuid, 'account_created')
      `;
      if (builderClaim?.product_family && builderClaim.plan_key) {
        await sql`
          INSERT INTO tenancy.builder_draft_claims (
            tenant_id, claimed_by_user_id, claimed_by_membership_id,
            source_session_id, source_draft_id, source_revision, schema_version,
            product_family, plan_key, state_json, claimed_at
          ) VALUES (
            ${command.tenantId}::uuid, ${command.userId}::uuid, ${command.membershipId}::uuid,
            ${builderClaim.session_id}::uuid, ${builderClaim.draft_id}::uuid,
            ${builderClaim.revision}, ${builderClaim.schema_version},
            ${builderClaim.product_family}, ${builderClaim.plan_key},
            ${sql.json(builderClaim.state_json as never)}, ${command.now}
          )
        `;
        await sql`
          UPDATE builder.drafts SET status = 'claimed', updated_at = ${command.now}
          WHERE id = ${builderClaim.draft_id}::uuid AND status = 'active'
        `;
        await sql`
          UPDATE builder.anonymous_sessions
          SET status = 'claimed', pending_registration_id = NULL,
              claimed_registration_id = ${signup.intent_id}::uuid,
              claimed_tenant_id = ${command.tenantId}::uuid,
              claimed_at = ${command.now}, last_seen_at = ${command.now}
          WHERE id = ${builderClaim.session_id}::uuid AND status = 'active'
        `;
      }
      if (signup.selected_plan_key) {
        const planRows = await sql<{
          product_key: string;
          plan_version_id: string;
          entitlements: Record<string, boolean | string | number | null>;
          allowances: Record<string, number | null>;
          overage_rates_minor: Record<string, number | null>;
          limits: Record<string, number | null>;
        }[]>`
          SELECT plan.product_key, version.id AS plan_version_id, version.entitlements,
                 version.allowances, version.overage_rates_minor, version.limits
          FROM catalog.plans plan
          JOIN catalog.plan_versions version ON version.plan_id = plan.id
          WHERE plan.plan_key = ${signup.selected_plan_key}
            AND plan.status = 'active'
            AND version.status = 'published'
            AND version.effective_from <= ${command.now}
            AND (version.effective_to IS NULL OR version.effective_to > ${command.now})
          ORDER BY version.version DESC
          LIMIT 1
        `;
        const selectedPlan = planRows[0];
        if (!selectedPlan) throw new Error("selected_plan_version_unavailable");
        const resolved = {
          tenantId: command.tenantId,
          subscriptionId: command.subscriptionId,
          productKey: selectedPlan.product_key,
          publicPlanKey: signup.selected_plan_key,
          planVersionId: selectedPlan.plan_version_id,
          accessMode: "none",
          entitlements: selectedPlan.entitlements,
          allowances: selectedPlan.allowances,
          overageRatesMinor: selectedPlan.overage_rates_minor,
          limits: selectedPlan.limits,
          resolvedAt: command.now.toISOString(),
        };
        await sql`
          INSERT INTO tenancy.product_subscriptions (
            id, tenant_id, product_key, plan_version_id, status
          ) VALUES (
            ${command.subscriptionId}::uuid, ${command.tenantId}::uuid,
            ${selectedPlan.product_key}, ${selectedPlan.plan_version_id}::uuid, 'pending'
          )
        `;
        await sql`
          INSERT INTO tenancy.entitlement_snapshots (
            id, tenant_id, subscription_id, product_key, plan_version_id,
            subscription_status, access_mode, resolved_json, resolution_hash
          ) VALUES (
            ${command.entitlementSnapshotId}::uuid, ${command.tenantId}::uuid,
            ${command.subscriptionId}::uuid, ${selectedPlan.product_key},
            ${selectedPlan.plan_version_id}::uuid, 'pending', 'none', ${sql.json(resolved)},
            digest(convert_to(${JSON.stringify(resolved)}, 'UTF8'), 'sha256')
          )
        `;
        const customerUnit = selectedPlan.product_key === "flowbot"
          ? "flow_execution"
          : selectedPlan.product_key === "ai_chat" ? "ai_response" : "voice_minute";
        await sql`
          INSERT INTO tenancy.quota_accounts (
            id, tenant_id, subscription_id, product_key, customer_unit,
            period_start, period_end, included_quantity
          ) VALUES (
            ${command.quotaAccountId}::uuid, ${command.tenantId}::uuid,
            ${command.subscriptionId}::uuid, ${selectedPlan.product_key}, ${customerUnit},
            ${command.now}, ${new Date(command.now.getTime() + 31 * 24 * 60 * 60 * 1000)},
            ${(selectedPlan.allowances[customerUnit] as number | null | undefined) ?? null}
          )
        `;
      }
      await sql`
        INSERT INTO identity.legal_acceptances (
          user_id, tenant_id, document_type, document_version, accepted_at, request_id
        ) VALUES
          (${command.userId}::uuid, ${command.tenantId}::uuid, 'terms', ${signup.terms_version}, ${command.now}, ${command.requestId}),
          (${command.userId}::uuid, ${command.tenantId}::uuid, 'privacy', ${signup.privacy_version}, ${command.now}, ${command.requestId})
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${command.tenantId}::uuid, ${command.userId}::uuid, ${command.membershipId}::uuid,
          'tenant.provisioned', 'tenant', ${command.tenantId}, ${command.requestId},
          'succeeded', ${sql.json({ source: "public_registration" })}
        )
      `;
      await sql`
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (
          ${command.tenantId}::uuid, 'tenant.provisioned',
          ${sql.json({ tenantId: command.tenantId, userId: command.userId })},
          ${`tenant-provisioned:${signup.intent_id}`}
        )
      `;
      await sql`
        UPDATE billing.purchase_intents
        SET tenant_id = ${command.tenantId}::uuid
        WHERE registration_id = ${signup.intent_id}::uuid
          AND status = 'open'
          AND tenant_id IS NULL
          AND expires_at > ${command.now}
      `;
      await sql`
        UPDATE identity.signup_intents
        SET status = 'provisioned', verified_at = ${command.now}, provisioned_at = ${command.now},
            provisioned_user_id = ${command.userId}::uuid,
            provisioned_tenant_id = ${command.tenantId}::uuid,
            password_hash = NULL
        WHERE id = ${signup.intent_id}::uuid
      `;
      await sql`
        UPDATE identity.one_time_tokens
        SET consumed_at = ${command.now}
        WHERE id = ${signup.token_id}::uuid
      `;
      return { status: "provisioned" as const, tenantId: command.tenantId, userId: command.userId };
    });
  }

  async findLoginIdentity(emailNormalized: string) {
    const identities = await this.client<{
      user_id: string;
      password_hash: string;
      mfa_enabled: boolean;
    }[]>`
      SELECT email.user_id, credential.password_hash,
             EXISTS (
               SELECT 1 FROM identity.mfa_factors factor
               WHERE factor.user_id = email.user_id
                 AND factor.verified_at IS NOT NULL AND factor.disabled_at IS NULL
             ) AS mfa_enabled
      FROM identity.email_addresses email
      JOIN identity.users app_user ON app_user.id = email.user_id
      JOIN identity.user_credentials credential ON credential.user_id = app_user.id
      WHERE email.email_normalized = ${emailNormalized}
        AND email.verified_at IS NOT NULL
        AND app_user.status = 'active'
        AND app_user.deleted_at IS NULL
      LIMIT 1
    `;
    const identity = identities[0];
    if (!identity) return null;

    const workspaces = await this.client<{
      tenant_id: string;
      tenant_slug: string;
      business_name: string;
      membership_id: string;
      membership_role: TenantRole;
    }[]>`
      SELECT * FROM identity.active_memberships_for_user(${identity.user_id}::uuid)
    `;
    return {
      userId: identity.user_id,
      passwordHash: identity.password_hash,
      mfaEnabled: identity.mfa_enabled,
      workspaces: workspaces.map((workspace) => ({
        tenantId: workspace.tenant_id,
        slug: workspace.tenant_slug,
        businessName: workspace.business_name,
        membershipId: workspace.membership_id,
        role: workspace.membership_role,
      })),
    };
  }

  async createSession(command: CreateSessionCommand) {
    await this.client.begin(async (sql) => {
      await sql`
        INSERT INTO identity.auth_sessions (
          id, user_id, token_hash, family_id, selected_tenant_id,
          idle_expires_at, absolute_expires_at, reauthenticated_at
          , mfa_verified_at
        ) VALUES (
          ${command.sessionId}::uuid, ${command.userId}::uuid, ${command.tokenHash},
          ${command.familyId}::uuid, ${command.selectedTenantId}::uuid,
          ${command.idleExpiresAt}, ${command.absoluteExpiresAt}, ${command.reauthenticatedAt},
          ${command.mfaVerifiedAt ?? null}
        )
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result, metadata
        ) VALUES (
          ${command.userId}::uuid, 'tenant', 'auth.login', 'auth_session',
          ${command.sessionId}, ${command.requestId}, 'succeeded',
          ${sql.json({ selectedTenantId: command.selectedTenantId })}
        )
      `;
    });
  }

  async createRecoveryIntent(command: CreateRecoveryIntentCommand) {
    await this.client.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${command.emailNormalized}, 0))`;
      const users = await sql<{ user_id: string }[]>`
        SELECT email.user_id
        FROM identity.email_addresses email
        JOIN identity.users app_user ON app_user.id = email.user_id
        WHERE email.email_normalized = ${command.emailNormalized}
          AND email.verified_at IS NOT NULL
          AND app_user.status = 'active'
          AND app_user.deleted_at IS NULL
        LIMIT 1
      `;
      const user = users[0];
      if (!user) return;

      await sql`
        UPDATE identity.one_time_tokens
        SET consumed_at = now()
        WHERE user_id = ${user.user_id}::uuid
          AND purpose = 'recover_password'
          AND consumed_at IS NULL
      `;
      await sql`
        INSERT INTO identity.one_time_tokens (
          id, token_hash, purpose, user_id, expires_at
        ) VALUES (
          ${command.tokenId}::uuid, ${command.tokenHash}, 'recover_password',
          ${user.user_id}::uuid, ${command.tokenExpiresAt}
        )
      `;
      await sql`
        INSERT INTO operations.outbox (
          topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key
        ) VALUES (
          'auth.recover_password', 'user', ${user.user_id}::uuid,
          ${command.outboxPayloadCiphertext}, ${`recover:${command.tokenId}`}
        )
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${user.user_id}::uuid, 'public', 'auth.recovery_requested', 'user',
          ${user.user_id}, ${command.requestId}, 'succeeded'
        )
      `;
    });
  }

  async completeRecovery(command: CompleteRecoveryCommand) {
    return this.client.begin(async (sql) => {
      const tokens = await sql<{
        id: string;
        user_id: string;
        expires_at: Date;
        consumed_at: Date | null;
      }[]>`
        SELECT id, user_id, expires_at, consumed_at
        FROM identity.one_time_tokens
        WHERE token_hash = ${command.tokenHash}
          AND purpose = 'recover_password'
        FOR UPDATE
      `;
      const token = tokens[0];
      if (!token || token.consumed_at || token.expires_at.getTime() <= command.now.getTime()) {
        return "invalid_or_expired" as const;
      }

      await sql`
        UPDATE identity.user_credentials
        SET password_hash = ${command.passwordHash}, password_changed_at = ${command.now},
            compromised_at = NULL, updated_at = ${command.now}
        WHERE user_id = ${token.user_id}::uuid
      `;
      await sql`
        UPDATE identity.one_time_tokens
        SET consumed_at = ${command.now}
        WHERE id = ${token.id}::uuid
      `;
      await sql`
        UPDATE identity.auth_sessions
        SET revoked_at = ${command.now}, revoke_reason = 'password_recovery'
        WHERE user_id = ${token.user_id}::uuid AND revoked_at IS NULL
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${token.user_id}::uuid, 'public', 'auth.password_recovered', 'user',
          ${token.user_id}, ${command.requestId}, 'succeeded'
        )
      `;
      return "completed" as const;
    });
  }

  async consumeRateLimit(command: ConsumeRateLimitCommand) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT pg_advisory_xact_lock(
          hashtextextended(${`${command.scope}:${command.keyHash.toString("hex")}`}, 0)
        )
      `;
      const rows = await sql<{
        window_started_at: Date;
        attempt_count: number;
        blocked_until: Date | null;
      }[]>`
        SELECT window_started_at, attempt_count, blocked_until
        FROM operations.rate_limits
        WHERE scope = ${command.scope} AND key_hash = ${command.keyHash}
        FOR UPDATE
      `;
      const row = rows[0];
      if (!row) {
        await sql`
          INSERT INTO operations.rate_limits (
            scope, key_hash, window_started_at, attempt_count, updated_at
          ) VALUES (${command.scope}, ${command.keyHash}, ${command.now}, 1, ${command.now})
        `;
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (row.blocked_until && row.blocked_until.getTime() > command.now.getTime()) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((row.blocked_until.getTime() - command.now.getTime()) / 1000)),
        };
      }

      const windowEndsAt = row.window_started_at.getTime() + command.windowMs;
      if (windowEndsAt <= command.now.getTime()) {
        await sql`
          UPDATE operations.rate_limits
          SET window_started_at = ${command.now}, attempt_count = 1,
              blocked_until = NULL, updated_at = ${command.now}
          WHERE scope = ${command.scope} AND key_hash = ${command.keyHash}
        `;
        return { allowed: true, retryAfterSeconds: 0 };
      }

      const nextCount = row.attempt_count + 1;
      const allowed = nextCount <= command.limit;
      const blockedUntil = allowed ? null : new Date(windowEndsAt);
      await sql`
        UPDATE operations.rate_limits
        SET attempt_count = ${nextCount}, blocked_until = ${blockedUntil}, updated_at = ${command.now}
        WHERE scope = ${command.scope} AND key_hash = ${command.keyHash}
      `;
      return {
        allowed,
        retryAfterSeconds: allowed ? 0 : Math.max(1, Math.ceil((windowEndsAt - command.now.getTime()) / 1000)),
      };
    });
  }

  async resolveSession(tokenHash: Buffer, now: Date) {
    const rows = await this.client<{
      session_id: string;
      family_id: string;
      user_id: string;
      selected_tenant_id: string | null;
      idle_expires_at: Date;
      absolute_expires_at: Date;
      reauthenticated_at: Date;
      mfa_verified_at: Date | null;
      tenant_id: string | null;
      tenant_slug: string | null;
      business_name: string | null;
      membership_id: string | null;
      membership_role: TenantRole | null;
    }[]>`
      WITH valid_session AS (
        UPDATE identity.auth_sessions session
        SET last_seen_at = ${now}
        FROM identity.users app_user
        WHERE session.token_hash = ${tokenHash}
          AND session.revoked_at IS NULL
          AND session.idle_expires_at > ${now}
          AND session.absolute_expires_at > ${now}
          AND app_user.id = session.user_id
          AND app_user.status = 'active'
          AND app_user.deleted_at IS NULL
        RETURNING
          session.id AS session_id,
          session.family_id,
          session.user_id,
          session.selected_tenant_id,
          session.idle_expires_at,
          session.absolute_expires_at,
          session.reauthenticated_at,
          session.mfa_verified_at
      )
      SELECT
        session.session_id,
        session.family_id,
        session.user_id,
        session.selected_tenant_id,
        session.idle_expires_at,
        session.absolute_expires_at,
        session.reauthenticated_at,
        session.mfa_verified_at,
        workspace.tenant_id,
        workspace.tenant_slug,
        workspace.business_name,
        workspace.membership_id,
        workspace.membership_role
      FROM valid_session session
      LEFT JOIN LATERAL identity.active_memberships_for_user(session.user_id) workspace ON true
    `;
    const session = rows[0];
    if (!session) return null;
    const mapped = rows.flatMap((workspace) => workspace.tenant_id && workspace.tenant_slug
      && workspace.business_name && workspace.membership_id && workspace.membership_role
      ? [{
          tenantId: workspace.tenant_id,
          slug: workspace.tenant_slug,
          businessName: workspace.business_name,
          membershipId: workspace.membership_id,
          role: workspace.membership_role,
        }]
      : []);
    return {
      sessionId: session.session_id,
      familyId: session.family_id,
      userId: session.user_id,
      selectedTenantId: mapped.some((workspace) => workspace.tenantId === session.selected_tenant_id)
        ? session.selected_tenant_id
        : null,
      idleExpiresAt: session.idle_expires_at,
      absoluteExpiresAt: session.absolute_expires_at,
      reauthenticatedAt: session.reauthenticated_at,
      mfaVerifiedAt: session.mfa_verified_at,
      workspaces: mapped,
    };
  }

  async listUserSessions(userId: string, now: Date) {
    const sessions = await this.client<{
      session_id: string;
      created_at: Date;
      last_seen_at: Date;
      idle_expires_at: Date;
      absolute_expires_at: Date;
      selected_tenant_id: string | null;
    }[]>`
      SELECT id AS session_id, created_at, last_seen_at, idle_expires_at,
             absolute_expires_at, selected_tenant_id
      FROM identity.auth_sessions
      WHERE user_id = ${userId}::uuid
        AND revoked_at IS NULL
        AND idle_expires_at > ${now}
        AND absolute_expires_at > ${now}
      ORDER BY last_seen_at DESC, id
    `;
    return sessions.map((session) => ({
      sessionId: session.session_id,
      current: false,
      createdAt: session.created_at,
      lastSeenAt: session.last_seen_at,
      idleExpiresAt: session.idle_expires_at,
      absoluteExpiresAt: session.absolute_expires_at,
      selectedTenantId: session.selected_tenant_id,
    }));
  }

  async revokeUserSession(command: RevokeUserSessionCommand) {
    return this.client.begin(async (sql) => {
      const revoked = await sql<{ id: string }[]>`
        UPDATE identity.auth_sessions
        SET revoked_at = ${command.now}, revoke_reason = 'user_revoked'
        WHERE id = ${command.sessionId}::uuid
          AND user_id = ${command.userId}::uuid
          AND revoked_at IS NULL
        RETURNING id
      `;
      if (!revoked[0]) return false;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${command.userId}::uuid, 'tenant', 'auth.session_revoked', 'auth_session',
          ${command.sessionId}, ${command.requestId}, 'succeeded'
        )
      `;
      return true;
    });
  }

  async rotateWorkspaceSession(command: RotateWorkspaceSessionCommand) {
    return this.client.begin(async (sql) => {
      const sessions = await sql<{ id: string; user_id: string }[]>`
        SELECT id, user_id
        FROM identity.auth_sessions
        WHERE token_hash = ${command.currentTokenHash}
          AND revoked_at IS NULL
          AND idle_expires_at > ${command.now}
          AND absolute_expires_at > ${command.now}
        FOR UPDATE
      `;
      const session = sessions[0];
      if (!session) return false;
      const authorized = await sql<{ exists: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM identity.active_memberships_for_user(${session.user_id}::uuid)
          WHERE tenant_id = ${command.tenantId}::uuid
        ) AS exists
      `;
      if (!authorized[0]?.exists) return false;
      await sql`
        UPDATE identity.auth_sessions
        SET token_hash = ${command.replacementTokenHash},
            selected_tenant_id = ${command.tenantId}::uuid,
            idle_expires_at = ${command.idleExpiresAt},
            last_seen_at = ${command.now},
            rotated_at = ${command.now}
        WHERE id = ${session.id}::uuid
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${session.user_id}::uuid, 'tenant', 'auth.workspace_selected', 'tenant',
          ${command.tenantId}, ${command.requestId}, 'succeeded'
        )
      `;
      return true;
    });
  }

  async revokeSession(tokenHash: Buffer, now: Date, reason: string) {
    await this.client`
      UPDATE identity.auth_sessions
      SET revoked_at = ${now}, revoke_reason = ${reason}
      WHERE token_hash = ${tokenHash} AND revoked_at IS NULL
    `;
  }

  async createTenantInvitation(command: CreateTenantInvitationCommand) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT
          set_config('app.tenant_id', ${command.context.tenantId}, true),
          set_config('app.user_id', ${command.context.userId}, true),
          set_config('app.membership_id', ${command.context.membershipId}, true),
          set_config('app.session_id', ${command.context.sessionId}, true),
          set_config('app.request_id', ${command.context.requestId}, true)
      `;
      const actors = await sql<{ valid: boolean }[]>`
        SELECT EXISTS (
          SELECT 1 FROM tenancy.memberships
          WHERE id = ${command.context.membershipId}::uuid
            AND tenant_id = ${command.context.tenantId}::uuid
            AND user_id = ${command.context.userId}::uuid
            AND role = ${command.context.role}
            AND status = 'active'
        ) AS valid
      `;
      if (!actors[0]?.valid) return { status: "not_found" as const };

      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${command.context.tenantId}:${command.emailNormalized}`}, 0))`;
      const pending = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.membership_invitations
        WHERE tenant_id = ${command.context.tenantId}::uuid
          AND email_normalized = ${command.emailNormalized}
          AND status = 'pending'
        LIMIT 1
        FOR UPDATE
      `;
      if (pending[0]) return { status: "already_pending" as const };

      const capacity = await sql<{ allowed: boolean }[]>`
        SELECT allowed FROM tenancy.administrator_seat_capacity(false)
      `;
      if (!capacity[0]?.allowed) return { status: "seat_limit_reached" as const };

      await sql`
        INSERT INTO identity.one_time_tokens (
          id, token_hash, purpose, tenant_id, expires_at
        ) VALUES (
          ${command.tokenId}::uuid, ${command.tokenHash}, 'accept_invitation',
          ${command.context.tenantId}::uuid, ${command.expiresAt}
        )
      `;
      await sql`
        INSERT INTO tenancy.membership_invitations (
          id, tenant_id, email_normalized, role, invited_by_membership_id,
          token_id, expires_at
        ) VALUES (
          ${command.invitationId}::uuid, ${command.context.tenantId}::uuid,
          ${command.emailNormalized}, ${command.role}, ${command.context.membershipId}::uuid,
          ${command.tokenId}::uuid, ${command.expiresAt}
        )
      `;
      await sql`
        INSERT INTO operations.outbox (
          topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key
        ) VALUES (
          'tenant.invitation', 'membership_invitation', ${command.invitationId}::uuid,
          ${command.outboxPayloadCiphertext}, ${`invitation:${command.invitationId}`}
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${command.context.tenantId}::uuid, ${command.context.userId}::uuid,
          ${command.context.membershipId}::uuid, 'team.invitation_created',
          'membership_invitation', ${command.invitationId}, ${command.context.requestId},
          'succeeded', ${sql.json({ role: command.role })}
        )
      `;
      return { status: "created" as const, invitationId: command.invitationId };
    });
  }

  async acceptTenantInvitation(command: AcceptTenantInvitationCommand) {
    return this.client.begin(async (sql) => {
      const tokenCandidates = await sql<{ tenant_id: string }[]>`
        SELECT tenant_id
        FROM identity.one_time_tokens
        WHERE token_hash = ${command.tokenHash}
          AND purpose = 'accept_invitation'
        LIMIT 1
      `;
      const candidate = tokenCandidates[0];
      if (!candidate?.tenant_id) return { status: "invalid_or_expired" as const };
      await sql`
        SELECT
          set_config('app.tenant_id', ${candidate.tenant_id}, true),
          set_config('app.request_id', ${command.requestId}, true)
      `;
      const rows = await sql<{
        token_id: string;
        token_consumed_at: Date | null;
        token_expires_at: Date;
        invitation_id: string;
        invitation_status: string;
        email_normalized: string;
        role: InvitationRole;
        accepted_by_user_id: string | null;
      }[]>`
        SELECT token.id AS token_id, token.consumed_at AS token_consumed_at,
               token.expires_at AS token_expires_at, invitation.id AS invitation_id,
               invitation.status AS invitation_status, invitation.email_normalized,
               invitation.role, invitation.accepted_by_user_id
        FROM identity.one_time_tokens token
        JOIN tenancy.membership_invitations invitation ON invitation.token_id = token.id
        WHERE token.token_hash = ${command.tokenHash}
          AND token.purpose = 'accept_invitation'
          AND invitation.tenant_id = ${candidate.tenant_id}::uuid
        FOR UPDATE OF token, invitation
      `;
      const invitation = rows[0];
      if (!invitation) return { status: "invalid_or_expired" as const };
      if (invitation.invitation_status === 'accepted' && invitation.accepted_by_user_id) {
        const memberships = await sql<{ id: string }[]>`
          SELECT id FROM tenancy.memberships
          WHERE tenant_id = ${candidate.tenant_id}::uuid
            AND user_id = ${invitation.accepted_by_user_id}::uuid
          LIMIT 1
        `;
        if (!memberships[0]) return { status: "invalid_or_expired" as const };
        return {
          status: "already_accepted" as const,
          tenantId: candidate.tenant_id,
          userId: invitation.accepted_by_user_id,
          membershipId: memberships[0].id,
          emailNormalized: invitation.email_normalized,
          createdUser: false,
        };
      }
      if (
        invitation.token_consumed_at
        || invitation.token_expires_at.getTime() <= command.now.getTime()
        || invitation.invitation_status !== "pending"
      ) {
        await sql`
          UPDATE tenancy.membership_invitations SET status = 'expired'
          WHERE id = ${invitation.invitation_id}::uuid AND status = 'pending'
        `;
        return { status: "invalid_or_expired" as const };
      }

      const capacity = await sql<{ allowed: boolean }[]>`
        SELECT allowed FROM tenancy.administrator_seat_capacity(true)
      `;
      if (!capacity[0]?.allowed) return { status: "seat_limit_reached" as const };

      const existing = await sql<{ user_id: string }[]>`
        SELECT user_id FROM identity.email_addresses
        WHERE email_normalized = ${invitation.email_normalized}
        LIMIT 1
      `;
      let userId: string;
      let createdUser = false;
      if (existing[0]) {
        if (!command.authenticatedUserId) return { status: "sign_in_required" as const };
        if (existing[0].user_id !== command.authenticatedUserId) {
          return { status: "invalid_or_expired" as const };
        }
        userId = existing[0].user_id;
      } else {
        if (!command.displayName || !command.passwordHash) {
          return { status: "account_details_required" as const };
        }
        userId = command.newUserId;
        createdUser = true;
        await sql`
          INSERT INTO identity.users (id, display_name, status, locale)
          VALUES (${userId}::uuid, ${command.displayName}, 'active', 'en')
        `;
        await sql`
          INSERT INTO identity.user_credentials (user_id, password_hash)
          VALUES (${userId}::uuid, ${command.passwordHash})
        `;
        await sql`
          INSERT INTO identity.email_addresses (
            id, user_id, email, email_normalized, is_primary, verified_at
          ) VALUES (
            ${command.newEmailId}::uuid, ${userId}::uuid, ${invitation.email_normalized},
            ${invitation.email_normalized}, true, ${command.now}
          )
        `;
      }

      const existingMembership = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.memberships
        WHERE tenant_id = ${candidate.tenant_id}::uuid AND user_id = ${userId}::uuid
        FOR UPDATE
      `;
      const membershipId = existingMembership[0]?.id ?? command.newMembershipId;
      if (existingMembership[0]) {
        await sql`
          UPDATE tenancy.memberships
          SET role = ${invitation.role}, status = 'active', accepted_at = ${command.now},
              updated_at = ${command.now}, revoked_at = NULL
          WHERE id = ${membershipId}::uuid
        `;
      } else {
        await sql`
          INSERT INTO tenancy.memberships (
            id, tenant_id, user_id, role, status, accepted_at
          ) VALUES (
            ${membershipId}::uuid, ${candidate.tenant_id}::uuid, ${userId}::uuid,
            ${invitation.role}, 'active', ${command.now}
          )
        `;
      }
      await sql`
        UPDATE tenancy.membership_invitations
        SET status = 'accepted', accepted_by_user_id = ${userId}::uuid, accepted_at = ${command.now}
        WHERE id = ${invitation.invitation_id}::uuid
      `;
      await sql`
        UPDATE identity.one_time_tokens
        SET user_id = ${userId}::uuid, consumed_at = ${command.now}
        WHERE id = ${invitation.token_id}::uuid
      `;
      await sql`
        UPDATE identity.auth_sessions
        SET revoked_at = ${command.now}, revoke_reason = 'membership_privilege_changed'
        WHERE user_id = ${userId}::uuid AND revoked_at IS NULL
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${candidate.tenant_id}::uuid, ${userId}::uuid, ${membershipId}::uuid,
          'team.invitation_accepted', 'membership', ${membershipId}, ${command.requestId},
          'succeeded', ${sql.json({ role: invitation.role, createdUser })}
        )
      `;
      await sql`
        INSERT INTO tenancy.outbox (tenant_id, topic, payload, idempotency_key)
        VALUES (
          ${candidate.tenant_id}::uuid, 'team.membership_activated',
          ${sql.json({ membershipId, userId, role: invitation.role })},
          ${`membership-activated:${invitation.invitation_id}`}
        )
      `;
      return {
        status: "accepted" as const,
        tenantId: candidate.tenant_id,
        userId,
        membershipId,
        emailNormalized: invitation.email_normalized,
        createdUser,
      };
    });
  }

  async createOwnershipTransfer(command: CreateOwnershipTransferCommand) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT
          set_config('app.tenant_id', ${command.context.tenantId}, true),
          set_config('app.user_id', ${command.context.userId}, true),
          set_config('app.membership_id', ${command.context.membershipId}, true),
          set_config('app.session_id', ${command.context.sessionId}, true),
          set_config('app.request_id', ${command.context.requestId}, true)
      `;
      const actors = await sql<{ valid: boolean }[]>`
        SELECT EXISTS (
          SELECT 1
          FROM tenancy.memberships membership
          JOIN identity.auth_sessions session ON session.id = ${command.context.sessionId}::uuid
          WHERE membership.id = ${command.context.membershipId}::uuid
            AND membership.tenant_id = ${command.context.tenantId}::uuid
            AND membership.user_id = ${command.context.userId}::uuid
            AND membership.role = 'tenant_master_admin'
            AND membership.status = 'active'
            AND session.user_id = membership.user_id
            AND session.revoked_at IS NULL
            AND session.reauthenticated_at >= now() - interval '10 minutes'
            AND session.mfa_verified_at >= now() - interval '10 minutes'
        ) AS valid
      `;
      if (!actors[0]?.valid) return { status: "reauthentication_required" as const };

      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`ownership:${command.context.tenantId}`}, 0))`;
      const pending = await sql<{ id: string }[]>`
        SELECT id FROM tenancy.ownership_transfers
        WHERE tenant_id = ${command.context.tenantId}::uuid AND status = 'pending'
        LIMIT 1 FOR UPDATE
      `;
      if (pending[0]) return { status: "already_pending" as const };

      const targets = await sql<{ user_id: string; email_normalized: string }[]>`
        SELECT membership.user_id, email.email_normalized
        FROM tenancy.memberships membership
        JOIN identity.users app_user ON app_user.id = membership.user_id
        JOIN identity.email_addresses email ON email.user_id = app_user.id AND email.is_primary = true
        WHERE membership.id = ${command.targetMembershipId}::uuid
          AND membership.tenant_id = ${command.context.tenantId}::uuid
          AND membership.status = 'active'
          AND membership.role <> 'tenant_master_admin'
          AND app_user.status = 'active'
          AND email.verified_at IS NOT NULL
        LIMIT 1
        FOR UPDATE OF membership
      `;
      const target = targets[0];
      if (!target) return { status: "not_found" as const };

      await sql`
        INSERT INTO identity.one_time_tokens (
          id, token_hash, purpose, user_id, tenant_id, expires_at
        ) VALUES (
          ${command.tokenId}::uuid, ${command.tokenHash}, 'ownership_transfer',
          ${target.user_id}::uuid, ${command.context.tenantId}::uuid, ${command.expiresAt}
        )
      `;
      await sql`
        INSERT INTO tenancy.ownership_transfers (
          id, tenant_id, from_membership_id, to_membership_id, token_id, expires_at
        ) VALUES (
          ${command.transferId}::uuid, ${command.context.tenantId}::uuid,
          ${command.context.membershipId}::uuid, ${command.targetMembershipId}::uuid,
          ${command.tokenId}::uuid, ${command.expiresAt}
        )
      `;
      await sql`
        INSERT INTO operations.outbox (
          topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key
        ) VALUES (
          'tenant.ownership_transfer', 'ownership_transfer', ${command.transferId}::uuid,
          ${command.outboxPayloadCiphertext(target.email_normalized)},
          ${`ownership-transfer:${command.transferId}`}
        )
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${command.context.tenantId}::uuid, ${command.context.userId}::uuid,
          ${command.context.membershipId}::uuid, 'ownership.transfer_initiated',
          'ownership_transfer', ${command.transferId}, ${command.context.requestId},
          'succeeded', ${sql.json({ targetMembershipId: command.targetMembershipId })}
        )
      `;
      return { status: "created" as const, transferId: command.transferId };
    });
  }

  async acceptOwnershipTransfer(command: AcceptOwnershipTransferCommand) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT
          set_config('app.tenant_id', ${command.context.tenantId}, true),
          set_config('app.user_id', ${command.context.userId}, true),
          set_config('app.membership_id', ${command.context.membershipId}, true),
          set_config('app.session_id', ${command.context.sessionId}, true),
          set_config('app.request_id', ${command.context.requestId}, true)
      `;
      const transfers = await sql<{
        transfer_id: string;
        status: string;
        expires_at: Date;
        from_membership_id: string;
        to_membership_id: string;
        from_user_id: string;
        to_user_id: string;
        token_id: string;
        token_expires_at: Date;
        token_consumed_at: Date | null;
        session_reauthenticated_at: Date | null;
        session_mfa_verified_at: Date | null;
      }[]>`
        SELECT transfer.id AS transfer_id, transfer.status, transfer.expires_at,
               transfer.from_membership_id, transfer.to_membership_id,
               owner_membership.user_id AS from_user_id,
               target_membership.user_id AS to_user_id,
               token.id AS token_id, token.expires_at AS token_expires_at,
               token.consumed_at AS token_consumed_at,
               session.reauthenticated_at AS session_reauthenticated_at
               , session.mfa_verified_at AS session_mfa_verified_at
        FROM tenancy.ownership_transfers transfer
        JOIN tenancy.memberships owner_membership ON owner_membership.id = transfer.from_membership_id
          AND owner_membership.tenant_id = transfer.tenant_id
        JOIN tenancy.memberships target_membership ON target_membership.id = transfer.to_membership_id
          AND target_membership.tenant_id = transfer.tenant_id
        JOIN identity.one_time_tokens token ON token.id = transfer.token_id
        LEFT JOIN identity.auth_sessions session ON session.id = ${command.context.sessionId}::uuid
          AND session.user_id = ${command.context.userId}::uuid AND session.revoked_at IS NULL
        WHERE transfer.id = ${command.transferId}::uuid
          AND transfer.tenant_id = ${command.context.tenantId}::uuid
          AND token.token_hash = ${command.tokenHash}
        FOR UPDATE OF transfer, token
      `;
      const transfer = transfers[0];
      if (!transfer) return { status: "not_found" as const };
      if (
        transfer.to_membership_id !== command.context.membershipId
        || transfer.to_user_id !== command.context.userId
        || !transfer.session_reauthenticated_at
        || !transfer.session_mfa_verified_at
        || command.now.getTime() - transfer.session_reauthenticated_at.getTime() > 10 * 60 * 1000
        || command.now.getTime() - transfer.session_mfa_verified_at.getTime() > 10 * 60 * 1000
      ) return { status: "reauthentication_required" as const };
      if (
        transfer.status !== "pending"
        || transfer.token_consumed_at
        || transfer.expires_at.getTime() <= command.now.getTime()
        || transfer.token_expires_at.getTime() <= command.now.getTime()
      ) return { status: "invalid_or_expired" as const };

      await sql`
        SELECT id FROM tenancy.memberships
        WHERE tenant_id = ${command.context.tenantId}::uuid
          AND id IN (${transfer.from_membership_id}::uuid, ${transfer.to_membership_id}::uuid)
        ORDER BY id
        FOR UPDATE
      `;
      const changed = await sql<{ id: string }[]>`
        UPDATE tenancy.memberships
        SET role = 'tenant_admin', updated_at = ${command.now}
        WHERE id = ${transfer.from_membership_id}::uuid
          AND tenant_id = ${command.context.tenantId}::uuid
          AND role = 'tenant_master_admin' AND status = 'active'
        RETURNING id
      `;
      if (!changed[0]) return { status: "invalid_or_expired" as const };
      const promoted = await sql<{ id: string }[]>`
        UPDATE tenancy.memberships
        SET role = 'tenant_master_admin', updated_at = ${command.now}
        WHERE id = ${transfer.to_membership_id}::uuid
          AND tenant_id = ${command.context.tenantId}::uuid
          AND role <> 'tenant_master_admin' AND status = 'active'
        RETURNING id
      `;
      if (!promoted[0]) return { status: "invalid_or_expired" as const };
      await sql`
        UPDATE tenancy.ownership_transfers
        SET status = 'accepted', accepted_at = ${command.now}
        WHERE id = ${transfer.transfer_id}::uuid
      `;
      await sql`
        UPDATE identity.one_time_tokens SET consumed_at = ${command.now}
        WHERE id = ${transfer.token_id}::uuid
      `;
      await sql`
        UPDATE identity.auth_sessions
        SET revoked_at = ${command.now}, revoke_reason = 'ownership_transferred'
        WHERE user_id IN (${transfer.from_user_id}::uuid, ${transfer.to_user_id}::uuid)
          AND revoked_at IS NULL
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result, metadata
        ) VALUES (
          ${command.context.tenantId}::uuid, ${command.context.userId}::uuid,
          ${command.context.membershipId}::uuid, 'ownership.transfer_accepted',
          'ownership_transfer', ${transfer.transfer_id}, ${command.context.requestId},
          'succeeded', ${sql.json({
            previousOwnerMembershipId: transfer.from_membership_id,
            newOwnerMembershipId: transfer.to_membership_id,
            previousOwnerRole: "tenant_master_admin",
            newOwnerRole: "tenant_master_admin",
          })}
        )
      `;
      return { status: "accepted" as const, transferId: transfer.transfer_id };
    });
  }

  async cancelOwnershipTransfer(command: CancelOwnershipTransferCommand) {
    return this.client.begin(async (sql) => {
      await sql`
        SELECT
          set_config('app.tenant_id', ${command.context.tenantId}, true),
          set_config('app.user_id', ${command.context.userId}, true),
          set_config('app.membership_id', ${command.context.membershipId}, true),
          set_config('app.session_id', ${command.context.sessionId}, true),
          set_config('app.request_id', ${command.context.requestId}, true)
      `;
      const cancelled = await sql<{ id: string; token_id: string }[]>`
        UPDATE tenancy.ownership_transfers transfer
        SET status = 'cancelled', cancelled_at = ${command.now}
        FROM tenancy.memberships membership, identity.auth_sessions session
        WHERE transfer.id = ${command.transferId}::uuid
          AND transfer.tenant_id = ${command.context.tenantId}::uuid
          AND transfer.status = 'pending'
          AND membership.id = ${command.context.membershipId}::uuid
          AND membership.id = transfer.from_membership_id
          AND membership.user_id = ${command.context.userId}::uuid
          AND membership.role = 'tenant_master_admin' AND membership.status = 'active'
          AND session.id = ${command.context.sessionId}::uuid
          AND session.user_id = membership.user_id AND session.revoked_at IS NULL
          AND session.reauthenticated_at >= ${new Date(command.now.getTime() - 10 * 60 * 1000)}
          AND session.mfa_verified_at >= ${new Date(command.now.getTime() - 10 * 60 * 1000)}
        RETURNING transfer.id, transfer.token_id
      `;
      if (!cancelled[0]) return { status: "not_found" as const };
      await sql`
        UPDATE identity.one_time_tokens SET consumed_at = ${command.now}
        WHERE id = ${cancelled[0].token_id}::uuid AND consumed_at IS NULL
      `;
      await sql`
        INSERT INTO tenancy.audit_logs (
          tenant_id, actor_user_id, actor_membership_id, action, target_type,
          target_id, request_id, result
        ) VALUES (
          ${command.context.tenantId}::uuid, ${command.context.userId}::uuid,
          ${command.context.membershipId}::uuid, 'ownership.transfer_cancelled',
          'ownership_transfer', ${command.transferId}, ${command.context.requestId}, 'succeeded'
        )
      `;
      return { status: "cancelled" as const, transferId: command.transferId };
    });
  }

  async createTenantLoginChallenge(command: CreateTenantLoginChallengeCommand) {
    await this.client.begin(async (sql) => {
      await sql`
        UPDATE identity.auth_login_challenges SET consumed_at = ${command.now}
        WHERE user_id = ${command.userId}::uuid AND consumed_at IS NULL
      `;
      await sql`
        INSERT INTO identity.auth_login_challenges (
          id, user_id, token_hash, password_verified_at, expires_at
        ) VALUES (
          ${command.challengeId}::uuid, ${command.userId}::uuid, ${command.tokenHash},
          ${command.now}, ${command.expiresAt}
        )
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${command.userId}::uuid, 'tenant', 'auth.password_verified',
          'auth_login_challenge', ${command.challengeId}, ${command.requestId}, 'succeeded'
        )
      `;
    });
  }

  async resolveTenantLoginChallenge(tokenHash: Buffer, now: Date) {
    const rows = await this.client<{
      challenge_id: string;
      user_id: string;
      secret_ciphertext: Buffer;
      password_verified_at: Date;
      expires_at: Date;
    }[]>`
      SELECT challenge.id AS challenge_id, challenge.user_id,
             factor.secret_ciphertext, challenge.password_verified_at, challenge.expires_at
      FROM identity.auth_login_challenges challenge
      JOIN identity.users app_user ON app_user.id = challenge.user_id
      JOIN identity.mfa_factors factor ON factor.user_id = app_user.id
        AND factor.factor_type = 'totp' AND factor.verified_at IS NOT NULL
        AND factor.disabled_at IS NULL
      WHERE challenge.token_hash = ${tokenHash}
        AND challenge.consumed_at IS NULL AND challenge.expires_at > ${now}
        AND app_user.status = 'active'
      ORDER BY factor.verified_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    const workspaces = await this.client<{
      tenant_id: string;
      tenant_slug: string;
      business_name: string;
      membership_id: string;
      membership_role: TenantRole;
    }[]>`SELECT * FROM identity.active_memberships_for_user(${row.user_id}::uuid)`;
    return {
      challengeId: row.challenge_id,
      userId: row.user_id,
      secretEnvelope: row.secret_ciphertext.toString("utf8"),
      passwordVerifiedAt: row.password_verified_at,
      expiresAt: row.expires_at,
      workspaces: workspaces.map((workspace) => ({
        tenantId: workspace.tenant_id,
        slug: workspace.tenant_slug,
        businessName: workspace.business_name,
        membershipId: workspace.membership_id,
        role: workspace.membership_role,
      })),
    };
  }

  async completeTenantMfaLogin(command: CompleteTenantMfaLoginCommand) {
    return this.client.begin(async (sql) => {
      const challenges = await sql<{ id: string; user_id: string; password_verified_at: Date }[]>`
        SELECT id, user_id, password_verified_at
        FROM identity.auth_login_challenges
        WHERE token_hash = ${command.challengeTokenHash}
          AND consumed_at IS NULL AND expires_at > ${command.now}
        FOR UPDATE
      `;
      const challenge = challenges[0];
      if (!challenge) return false;
      await sql`
        UPDATE identity.auth_login_challenges SET consumed_at = ${command.now}
        WHERE id = ${challenge.id}::uuid
      `;
      await sql`
        INSERT INTO identity.auth_sessions (
          id, user_id, token_hash, family_id, selected_tenant_id,
          reauthenticated_at, mfa_verified_at, idle_expires_at, absolute_expires_at
        ) VALUES (
          ${command.sessionId}::uuid, ${challenge.user_id}::uuid, ${command.sessionTokenHash},
          ${command.familyId}::uuid, ${command.selectedTenantId}::uuid,
          ${challenge.password_verified_at}, ${command.now}, ${command.idleExpiresAt},
          ${command.absoluteExpiresAt}
        )
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${challenge.user_id}::uuid, 'tenant', 'auth.mfa_authenticated',
          'auth_session', ${command.sessionId}, ${command.requestId}, 'succeeded'
        )
      `;
      return true;
    });
  }

  async createMfaEnrollment(command: CreateMfaEnrollmentCommand) {
    await this.client.begin(async (sql) => {
      await sql`
        DELETE FROM identity.mfa_factors
        WHERE user_id = ${command.userId}::uuid
          AND factor_type = 'totp' AND verified_at IS NULL
      `;
      await sql`
        INSERT INTO identity.mfa_factors (
          id, user_id, factor_type, label, secret_ciphertext
        ) VALUES (
          ${command.factorId}::uuid, ${command.userId}::uuid, 'totp',
          'Primary authenticator', ${Buffer.from(command.secretEnvelope, "utf8")}
        )
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${command.userId}::uuid, 'tenant', 'auth.mfa_enrollment_started',
          'mfa_factor', ${command.factorId}, ${command.requestId}, 'succeeded'
        )
      `;
    });
  }

  async getMfaEnrollment(userId: string, factorId: string) {
    const rows = await this.client<{
      factor_id: string;
      secret_ciphertext: Buffer;
      verified_at: Date | null;
    }[]>`
      SELECT id AS factor_id, secret_ciphertext, verified_at
      FROM identity.mfa_factors
      WHERE id = ${factorId}::uuid AND user_id = ${userId}::uuid
        AND factor_type = 'totp' AND disabled_at IS NULL
      LIMIT 1
    `;
    const row = rows[0];
    return row ? {
      factorId: row.factor_id,
      secretEnvelope: row.secret_ciphertext.toString("utf8"),
      verifiedAt: row.verified_at,
    } : null;
  }

  async completeMfaEnrollment(command: CompleteMfaEnrollmentCommand) {
    return this.client.begin(async (sql) => {
      const factors = await sql<{ id: string }[]>`
        UPDATE identity.mfa_factors factor
        SET verified_at = ${command.now}
        FROM identity.auth_sessions session
        WHERE factor.id = ${command.factorId}::uuid
          AND factor.user_id = ${command.userId}::uuid
          AND factor.verified_at IS NULL AND factor.disabled_at IS NULL
          AND session.id = ${command.sessionId}::uuid
          AND session.user_id = factor.user_id AND session.revoked_at IS NULL
        RETURNING factor.id
      `;
      if (!factors[0]) return false;
      await sql`
        DELETE FROM identity.mfa_recovery_codes WHERE user_id = ${command.userId}::uuid
      `;
      for (const codeHash of command.recoveryCodeHashes) {
        await sql`
          INSERT INTO identity.mfa_recovery_codes (user_id, code_hash)
          VALUES (${command.userId}::uuid, ${codeHash})
        `;
      }
      await sql`
        UPDATE identity.auth_sessions SET mfa_verified_at = ${command.now}
        WHERE id = ${command.sessionId}::uuid AND user_id = ${command.userId}::uuid
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          actor_user_id, realm, action, target_type, target_id, request_id, result
        ) VALUES (
          ${command.userId}::uuid, 'tenant', 'auth.mfa_enrolled',
          'mfa_factor', ${command.factorId}, ${command.requestId}, 'succeeded'
        )
      `;
      return true;
    });
  }

  async resendVerification(command: ResendVerificationCommand) {
    await this.client.begin(async (sql) => {
      await sql`SELECT pg_advisory_xact_lock(hashtextextended(${command.emailNormalized}, 0))`;
      const intents = await sql<{ id: string }[]>`
        SELECT id FROM identity.signup_intents
        WHERE email_normalized = ${command.emailNormalized}
          AND status = 'verification_pending'
        ORDER BY requested_at DESC
        LIMIT 1
        FOR UPDATE
      `;
      const intent = intents[0];
      if (!intent) return;
      await sql`
        UPDATE identity.one_time_tokens SET consumed_at = now()
        WHERE signup_intent_id = ${intent.id}::uuid
          AND purpose = 'verify_email' AND consumed_at IS NULL
      `;
      await sql`
        INSERT INTO identity.one_time_tokens (
          id, token_hash, purpose, signup_intent_id, expires_at
        ) VALUES (
          ${command.tokenId}::uuid, ${command.tokenHash}, 'verify_email',
          ${intent.id}::uuid, ${command.expiresAt}
        )
      `;
      await sql`
        UPDATE identity.signup_intents SET expires_at = ${command.expiresAt}
        WHERE id = ${intent.id}::uuid
      `;
      await sql`
        INSERT INTO operations.outbox (
          topic, aggregate_type, aggregate_id, payload_ciphertext, idempotency_key
        ) VALUES (
          'auth.verify_email', 'signup_intent', ${intent.id}::uuid,
          ${command.outboxPayloadCiphertext}, ${`verify-resend:${command.tokenId}`}
        )
      `;
      await sql`
        INSERT INTO operations.audit_logs (
          realm, action, target_type, target_id, request_id, result
        ) VALUES (
          'public', 'auth.verification_resent', 'signup_intent', ${intent.id},
          ${command.requestId}, 'succeeded'
        )
      `;
    });
  }
}
