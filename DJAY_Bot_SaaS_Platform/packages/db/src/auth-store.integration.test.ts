import { randomBytes, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import {
  createLoginService,
  createInvitationService,
  createOwnershipService,
  createTenantMfaService,
  createRecoveryService,
  createRegistrationService,
  createSessionService,
  hashPassword,
  generateTotpCode,
  openJson,
} from "@djay/auth";
import { createTenantContext } from "@djay/tenancy";
import { runEmailBatch } from "@djay/notifications";
import { PostgresAuthStore } from "./auth-store";
import { AnonymousBuilderStore } from "./anonymous-builder-store";
import { AnonymousBuilderImportStore } from "./anonymous-builder-import-store";
import { createDatabaseClient } from "./client";
import { PostgresEmailOutboxStore } from "./email-outbox-store";

const databaseUrl = process.env.DATABASE_URL;
const adminDatabaseUrl = process.env.ADMIN_DATABASE_URL;
const workerDatabaseUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(databaseUrl && adminDatabaseUrl && workerDatabaseUrl);

const authClient = enabled ? createDatabaseClient(databaseUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminDatabaseUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerDatabaseUrl!) : null;

afterAll(async () => {
  await authClient?.end();
  await adminClient?.end();
  await workerClient?.end();
});

describe.runIf(enabled)("PostgreSQL registration and tenant provisioning", () => {
  it("provisions one tenant and owner exactly once from an encrypted verification outbox", async () => {
    const requestHashKey = randomBytes(32);
    const emailEnvelopeKey = randomBytes(32);
    const store = new PostgresAuthStore(authClient!);
    const service = createRegistrationService(store, {
      publicAppUrl: "https://signup.example.test",
      legalVersions: { termsVersion: "terms-test-1", privacyVersion: "privacy-test-1" },
      requestHashKey,
      emailEnvelopeKey,
    });
    const idempotencyKey = randomUUID();
    const builderSessionId = randomUUID();
    const builderDraftId = randomUUID();
    const email = `owner-${randomUUID()}@example.test`;
    const registration = {
      idempotencyKey,
      name: "Integration Owner",
      email,
      businessName: "Integration Business",
      password: "integration password 123",
      locale: "en" as const,
      timezone: "Asia/Bangkok",
      selectedPlanKey: "ai_chat_basic" as const,
      termsVersion: "terms-test-1",
      privacyVersion: "privacy-test-1",
      acceptTerms: true as const,
      acceptPrivacy: true as const,
    };

    const builderExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    await adminClient!`
      INSERT INTO builder.anonymous_sessions (id, issued_at, expires_at, last_seen_at)
      VALUES (${builderSessionId}::uuid, now(), ${builderExpiresAt}, now())
    `;
    const builderState = { schemaVersion: 1, locale: "en", configuration: { botName: "Claimed Builder" } };
    await adminClient!`
      INSERT INTO builder.drafts (
        id, session_id, revision, schema_version, product_family, plan_key,
        state_json, status, expires_at
      ) VALUES (
        ${builderDraftId}::uuid, ${builderSessionId}::uuid, 1, 1, 'text', 'ai_chat_basic',
        ${adminClient!.json(builderState)}, 'active', ${builderExpiresAt}
      )
    `;
    await adminClient!`
      INSERT INTO builder.draft_revisions (draft_id, revision, schema_version, state_json)
      VALUES (${builderDraftId}::uuid, 1, 1, ${adminClient!.json(builderState)})
    `;

    await Promise.all([
      service.register(registration, { builderSessionId }),
      service.register(registration, { builderSessionId }),
    ]);
    await expect(new AnonymousBuilderStore(authClient!).updateDraft({
      sessionId: builderSessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: "text",
      planKey: "ai_chat_basic",
      state: { ...builderState, configuration: { botName: "Changed after registration" } },
    })).resolves.toEqual({ status: "unavailable" });
    await expect(new AnonymousBuilderImportStore(authClient!).createJob({
      sessionId: builderSessionId,
      idempotencyKey: randomUUID(),
      draftRevision: 1,
      requestedUrl: "https://example.test/",
      normalizedUrl: "https://example.test/",
    })).resolves.toEqual({ status: "unavailable" });

    const outboxRows = await adminClient!<{ payload_ciphertext: string }[]>`
      SELECT payload_ciphertext
      FROM operations.outbox
      WHERE topic = 'auth.verify_email'
        AND aggregate_id = (
          SELECT id FROM identity.signup_intents WHERE idempotency_key = ${idempotencyKey}::uuid
        )
    `;
    expect(outboxRows).toHaveLength(1);
    const payload = openJson<{ verificationUrl: string }>(outboxRows[0]!.payload_ciphertext, emailEnvelopeKey);
    const token = new URLSearchParams(new URL(payload.verificationUrl).hash.slice(1)).get("token");
    expect(token).toBeTruthy();

    const verified = await service.verify({ token: token!, requestId: "integration-verify-1" });
    expect(verified.status).toBe("verified");
    if (verified.status !== "verified") throw new Error("Expected verified result.");

    const replay = await service.verify({ token: token!, requestId: "integration-verify-2" });
    expect(replay).toEqual({ status: "already_verified", tenantId: verified.tenantId });

    const counts = await adminClient!<{
      tenant_count: number;
      owner_count: number;
      onboarding_count: number;
      legal_count: number;
      audit_count: number;
      subscription_count: number;
      snapshot_count: number;
      quota_count: number;
      password_cleared: boolean;
      builder_claim_count: number;
      builder_session_status: string;
      builder_draft_status: string;
      claimed_bot_name: string;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.tenants WHERE id = ${verified.tenantId}::uuid) AS tenant_count,
        (SELECT count(*)::int FROM tenancy.memberships
          WHERE tenant_id = ${verified.tenantId}::uuid
            AND role = 'tenant_master_admin' AND status = 'active') AS owner_count,
        (SELECT count(*)::int FROM tenancy.tenant_onboarding
          WHERE tenant_id = ${verified.tenantId}::uuid) AS onboarding_count,
        (SELECT count(*)::int FROM identity.legal_acceptances
          WHERE tenant_id = ${verified.tenantId}::uuid) AS legal_count,
        (SELECT count(*)::int FROM tenancy.audit_logs
          WHERE tenant_id = ${verified.tenantId}::uuid AND action = 'tenant.provisioned') AS audit_count,
        (SELECT count(*)::int FROM tenancy.product_subscriptions
          WHERE tenant_id = ${verified.tenantId}::uuid AND product_key = 'ai_chat' AND status = 'pending') AS subscription_count,
        (SELECT count(*)::int FROM tenancy.entitlement_snapshots
          WHERE tenant_id = ${verified.tenantId}::uuid AND access_mode = 'none') AS snapshot_count,
        (SELECT count(*)::int FROM tenancy.quota_accounts
          WHERE tenant_id = ${verified.tenantId}::uuid AND customer_unit = 'ai_response') AS quota_count,
        (SELECT password_hash IS NULL FROM identity.signup_intents
          WHERE idempotency_key = ${idempotencyKey}::uuid) AS password_cleared,
        (SELECT count(*)::int FROM tenancy.builder_draft_claims
          WHERE tenant_id = ${verified.tenantId}::uuid AND source_draft_id = ${builderDraftId}::uuid) AS builder_claim_count,
        (SELECT status FROM builder.anonymous_sessions WHERE id = ${builderSessionId}::uuid) AS builder_session_status,
        (SELECT status FROM builder.drafts WHERE id = ${builderDraftId}::uuid) AS builder_draft_status,
        (SELECT state_json #>> '{configuration,botName}' FROM tenancy.builder_draft_claims
          WHERE tenant_id = ${verified.tenantId}::uuid) AS claimed_bot_name
    `;
    expect(counts[0]).toEqual({
      tenant_count: 1,
      owner_count: 1,
      onboarding_count: 1,
      legal_count: 2,
      audit_count: 1,
      subscription_count: 1,
      snapshot_count: 1,
      quota_count: 1,
      password_cleared: true,
      builder_claim_count: 1,
      builder_session_status: "claimed",
      builder_draft_status: "claimed",
      claimed_bot_name: "Claimed Builder",
    });

    const purchaseIntents = await adminClient!<{
      status: string;
      plan_key: string;
      tenant_id: string | null;
    }[]>`
      SELECT status, plan_key, tenant_id::text
      FROM billing.purchase_intents
      WHERE registration_id = (
        SELECT id FROM identity.signup_intents WHERE idempotency_key = ${idempotencyKey}::uuid
      )
    `;
    expect(purchaseIntents).toHaveLength(1);
    expect(purchaseIntents[0]).toMatchObject({
      status: "open",
      plan_key: "ai_chat_basic",
      tenant_id: verified.tenantId,
    });

    const tenantVisibility = await authClient!.begin(async (sql) => {
      await sql`SELECT set_config('app.tenant_id', ${verified.tenantId}, true)`;
      return sql<{ count: number }[]>`SELECT count(*)::int AS count FROM tenancy.tenants`;
    });
    expect(tenantVisibility[0]?.count).toBe(1);

    const login = createLoginService(store, { dummyPasswordHash: await hashPassword("dummy password for timing") });
    const authenticated = await login({
      email,
      password: registration.password,
      requestId: "integration-login-1",
    });
    expect(authenticated.status).toBe("authenticated");
    if (authenticated.status !== "authenticated") throw new Error("Expected authenticated result.");
    expect(authenticated.selectedTenantId).toBe(verified.tenantId);

    const recovery = createRecoveryService(store, {
      publicAppUrl: "https://signup.example.test",
      emailEnvelopeKey,
    });
    await recovery.request({ email, requestId: "integration-recovery-1" });
    const recoveryRows = await adminClient!<{ payload_ciphertext: string }[]>`
      SELECT payload_ciphertext FROM operations.outbox
      WHERE topic = 'auth.recover_password'
      ORDER BY created_at DESC LIMIT 1
    `;
    const recoveryPayload = openJson<{ recoveryUrl: string }>(recoveryRows[0]!.payload_ciphertext, emailEnvelopeKey);
    const recoveryToken = new URLSearchParams(new URL(recoveryPayload.recoveryUrl).hash.slice(1)).get("token");
    expect(recoveryToken).toBeTruthy();
    await expect(recovery.complete({
      token: recoveryToken,
      newPassword: "replacement integration password",
      requestId: "integration-recovery-2",
    })).resolves.toEqual({ status: "completed" });

    const revokedCount = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM identity.auth_sessions session
      JOIN identity.email_addresses email_address ON email_address.user_id = session.user_id
      WHERE email_address.email_normalized = ${email.toLowerCase()}
        AND session.revoked_at IS NOT NULL
        AND session.revoke_reason = 'password_recovery'
    `;
    expect(revokedCount[0]?.count).toBe(1);

    await expect(login({
      email,
      password: registration.password,
      requestId: "integration-login-old-password",
    })).resolves.toEqual({ status: "invalid_credentials" });
    const newLogin = await login({
      email,
      password: "replacement integration password",
      requestId: "integration-login-new-password",
    });
    expect(newLogin.status).toBe("authenticated");
    if (newLogin.status !== "authenticated") throw new Error("Expected authenticated result.");
    const sessions = createSessionService(store);
    const currentSession = await sessions.current(newLogin.sessionToken);
    expect(currentSession?.selectedTenantId).toBe(verified.tenantId);
    expect(currentSession?.reauthenticatedAt).toBeInstanceOf(Date);
    await expect(sessions.list(newLogin.sessionToken)).resolves.toEqual([
      expect.objectContaining({ sessionId: currentSession?.sessionId, current: true }),
    ]);
    const selected = await sessions.selectWorkspace(newLogin.sessionToken, {
      tenantId: verified.tenantId,
      requestId: "integration-workspace-select",
    });
    expect(selected.status).toBe("selected");
    if (selected.status !== "selected") throw new Error("Expected selected workspace.");
    await expect(sessions.current(newLogin.sessionToken)).resolves.toBeNull();
    await expect(sessions.current(selected.sessionToken)).resolves.toMatchObject({ selectedTenantId: verified.tenantId });
    const selectedCurrent = await sessions.current(selected.sessionToken);
    const revoked = await sessions.revokeOwned(selected.sessionToken, {
      sessionId: selectedCurrent!.sessionId,
      requestId: "integration-session-revoke",
    });
    expect(revoked).toEqual({ status: "revoked", revokedCurrent: true });
    await expect(sessions.current(selected.sessionToken)).resolves.toBeNull();

    const ownerMembership = await adminClient!<{ id: string; user_id: string }[]>`
      SELECT id, user_id FROM tenancy.memberships
      WHERE tenant_id = ${verified.tenantId}::uuid
        AND role = 'tenant_master_admin'
    `;
    const invitationService = createInvitationService(store, {
      publicAppUrl: "https://signup.example.test",
      emailEnvelopeKey,
    });
    const invitationContext = createTenantContext({
      tenantId: verified.tenantId,
      userId: ownerMembership[0]!.user_id,
      membershipId: ownerMembership[0]!.id,
      sessionId: randomUUID(),
      role: "tenant_master_admin",
      requestId: "integration-invite-create",
    });
    await expect(invitationService.invite(invitationContext, {
      email: `over-limit-${randomUUID()}@example.test`,
      role: "tenant_operator",
      requestId: "integration-invite-seat-limit",
    })).resolves.toMatchObject({ status: "seat_limit_reached" });
    const provisionedSubscriptions = await adminClient!<{ id: string }[]>`
      SELECT id FROM tenancy.product_subscriptions
      WHERE tenant_id = ${verified.tenantId}::uuid
      ORDER BY created_at LIMIT 1
    `;
    expect(provisionedSubscriptions).toHaveLength(1);
    const insertedSeatAddOn = await adminClient!<{ id: string }[]>`
      INSERT INTO tenancy.subscription_add_ons (
        tenant_id, subscription_id, add_on_key, quantity, status, effective_from
      ) VALUES (
        ${verified.tenantId}::uuid, ${provisionedSubscriptions[0]!.id}::uuid,
        'additional_administrator', 2, 'active', now()
      ) RETURNING id
    `;
    expect(insertedSeatAddOn).toHaveLength(1);
    const invitedEmail = `operator-${randomUUID()}@example.test`;
    const inviteResults = await Promise.all([
      invitationService.invite(invitationContext, {
        email: invitedEmail,
        role: "tenant_operator",
        requestId: "integration-invite-1",
      }),
      invitationService.invite(invitationContext, {
        email: invitedEmail,
        role: "tenant_operator",
        requestId: "integration-invite-2",
      }),
    ]);
    expect(inviteResults.map((result) => result.status).sort()).toEqual(["already_pending", "created"]);
    const invitationOutbox = await adminClient!<{ payload_ciphertext: string }[]>`
      SELECT payload_ciphertext FROM operations.outbox
      WHERE topic = 'tenant.invitation'
        AND aggregate_id IN (
          SELECT id FROM tenancy.membership_invitations
          WHERE tenant_id = ${verified.tenantId}::uuid AND email_normalized = ${invitedEmail}
        )
    `;
    expect(invitationOutbox).toHaveLength(1);
    const invitationPayload = openJson<{ invitationUrl: string }>(
      invitationOutbox[0]!.payload_ciphertext,
      emailEnvelopeKey,
    );
    const invitationToken = new URLSearchParams(new URL(invitationPayload.invitationUrl).hash.slice(1)).get("token");
    expect(invitationToken).toBeTruthy();
    const acceptedInvitation = await invitationService.accept({
      token: invitationToken,
      name: "Invited Operator",
      password: "invited operator password",
      requestId: "integration-invite-accept",
    });
    expect(acceptedInvitation).toMatchObject({
      status: "accepted",
      tenantId: verified.tenantId,
      createdUser: true,
    });
    if (acceptedInvitation.status !== "accepted") throw new Error("Expected accepted invitation.");
    await expect(invitationService.accept({
      token: invitationToken,
      name: "Invited Operator",
      password: "invited operator password",
      requestId: "integration-invite-replay",
    })).resolves.toMatchObject({ status: "already_accepted", tenantId: verified.tenantId });
    const invitationCounts = await adminClient!<{ owner_count: number; operator_count: number }[]>`
      SELECT
        count(*) FILTER (WHERE role = 'tenant_master_admin' AND status = 'active')::int AS owner_count,
        count(*) FILTER (WHERE role = 'tenant_operator' AND status = 'active')::int AS operator_count
      FROM tenancy.memberships WHERE tenant_id = ${verified.tenantId}::uuid
    `;
    expect(invitationCounts[0]).toEqual({ owner_count: 1, operator_count: 1 });

    const existingUserId = randomUUID();
    const existingEmailId = randomUUID();
    const existingEmail = `existing-${randomUUID()}@example.test`;
    await adminClient!`
      INSERT INTO identity.users (id, display_name, status, locale)
      VALUES (${existingUserId}::uuid, 'Existing Account', 'active', 'en')
    `;
    await adminClient!`
      INSERT INTO identity.email_addresses (
        id, user_id, email, email_normalized, is_primary, verified_at
      ) VALUES (
        ${existingEmailId}::uuid, ${existingUserId}::uuid, ${existingEmail},
        ${existingEmail}, true, now()
      )
    `;
    await expect(invitationService.invite(invitationContext, {
      email: existingEmail,
      role: "tenant_analyst",
      requestId: "integration-existing-invite-create",
    })).resolves.toMatchObject({ status: "created" });
    const existingInvitationOutbox = await adminClient!<{ payload_ciphertext: string }[]>`
      SELECT payload_ciphertext FROM operations.outbox
      WHERE topic = 'tenant.invitation'
        AND aggregate_id IN (
          SELECT id FROM tenancy.membership_invitations
          WHERE tenant_id = ${verified.tenantId}::uuid AND email_normalized = ${existingEmail}
        )
    `;
    const existingInvitationPayload = openJson<{ invitationUrl: string }>(
      existingInvitationOutbox[0]!.payload_ciphertext,
      emailEnvelopeKey,
    );
    const existingInvitationUrl = new URL(existingInvitationPayload.invitationUrl);
    const existingInvitationToken = new URLSearchParams(existingInvitationUrl.hash.slice(1)).get("token");
    expect(existingInvitationUrl.search).toBe("");
    await expect(invitationService.accept({
      token: existingInvitationToken,
      requestId: "integration-existing-invite-without-session",
    })).resolves.toEqual({ status: "sign_in_required" });
    await expect(invitationService.accept({
      token: existingInvitationToken,
      requestId: "integration-existing-invite-wrong-session",
    }, randomUUID())).resolves.toEqual({ status: "invalid_or_expired" });
    await expect(invitationService.accept({
      token: existingInvitationToken,
      requestId: "integration-existing-invite-accept",
    }, existingUserId)).resolves.toMatchObject({
      status: "accepted",
      tenantId: verified.tenantId,
      userId: existingUserId,
      createdUser: false,
    });
    const existingMembership = await adminClient!<{ role: string; status: string }[]>`
      SELECT role, status FROM tenancy.memberships
      WHERE tenant_id = ${verified.tenantId}::uuid AND user_id = ${existingUserId}::uuid
    `;
    expect(existingMembership).toEqual([{ role: "tenant_analyst", status: "active" }]);

    const targetLogin = await login({
      email: invitedEmail,
      password: "invited operator password",
      requestId: "integration-invited-login",
    });
    expect(targetLogin).toMatchObject({ status: "authenticated", selectedTenantId: verified.tenantId });
    if (targetLogin.status !== "authenticated") throw new Error("Expected target login.");

    const ownerLogin = await login({
      email,
      password: "replacement integration password",
      requestId: "integration-owner-transfer-login",
    });
    if (ownerLogin.status !== "authenticated") throw new Error("Expected owner login.");
    const ownerTransferSession = await sessions.current(ownerLogin.sessionToken);
    const targetTransferSession = await sessions.current(targetLogin.sessionToken);
    if (!ownerTransferSession || !targetTransferSession) throw new Error("Expected transfer sessions.");
    const tenantMfaKey = randomBytes(32);
    const tenantMfa = createTenantMfaService(store, {
      encryptionKey: tenantMfaKey,
      recoveryHashKey: randomBytes(32),
    });
    const ownerEnrollment = await tenantMfa.startEnrollment(
      ownerTransferSession.userId,
      "integration-owner-mfa-start",
      email,
    );
    const ownerSecret = new URL(ownerEnrollment.otpauthUrl).searchParams.get("secret");
    await expect(tenantMfa.verifyEnrollment(
      ownerTransferSession.userId,
      ownerTransferSession.sessionId,
      {
        factorId: ownerEnrollment.factorId,
        code: generateTotpCode(ownerSecret!),
        requestId: "integration-owner-mfa-verify",
      },
    )).resolves.toMatchObject({ status: "verified" });
    const targetEnrollment = await tenantMfa.startEnrollment(
      targetTransferSession.userId,
      "integration-target-mfa-start",
      invitedEmail,
    );
    const targetSecret = new URL(targetEnrollment.otpauthUrl).searchParams.get("secret");
    await expect(tenantMfa.verifyEnrollment(
      targetTransferSession.userId,
      targetTransferSession.sessionId,
      {
        factorId: targetEnrollment.factorId,
        code: generateTotpCode(targetSecret!),
        requestId: "integration-target-mfa-verify",
      },
    )).resolves.toMatchObject({ status: "verified" });
    const mfaOwnerSession = await sessions.current(ownerLogin.sessionToken);
    const mfaTargetSession = await sessions.current(targetLogin.sessionToken);
    if (!mfaOwnerSession?.mfaVerifiedAt || !mfaTargetSession?.mfaVerifiedAt) {
      throw new Error("Expected MFA-assured transfer sessions.");
    }
    const ownership = createOwnershipService(store, {
      tenantAppUrl: "https://tenant.example.test",
      emailEnvelopeKey,
    });
    const ownerContext = createTenantContext({
      tenantId: verified.tenantId,
      userId: ownerTransferSession.userId,
      membershipId: ownerMembership[0]!.id,
      sessionId: ownerTransferSession.sessionId,
      role: "tenant_master_admin",
      requestId: "integration-transfer-start",
    });
    const initiated = await ownership.initiate(ownerContext, {
      targetMembershipId: acceptedInvitation.membershipId,
    }, mfaOwnerSession.reauthenticatedAt, mfaOwnerSession.mfaVerifiedAt);
    expect(initiated.status).toBe("created");
    if (initiated.status !== "created") throw new Error("Expected created transfer.");
    const transferOutbox = await adminClient!<{ payload_ciphertext: string }[]>`
      SELECT payload_ciphertext FROM operations.outbox
      WHERE topic = 'tenant.ownership_transfer' AND aggregate_id = ${initiated.transferId}::uuid
    `;
    const transferPayload = openJson<{ transferUrl: string }>(
      transferOutbox[0]!.payload_ciphertext,
      emailEnvelopeKey,
    );
    const transferUrl = new URL(transferPayload.transferUrl);
    const transferFragment = new URLSearchParams(transferUrl.hash.slice(1));
    const transferToken = transferFragment.get("token");
    expect(transferFragment.get("transferId")).toBe(initiated.transferId);
    expect(transferToken).toBeTruthy();
    const targetContext = createTenantContext({
      tenantId: verified.tenantId,
      userId: targetTransferSession.userId,
      membershipId: acceptedInvitation.membershipId,
      sessionId: targetTransferSession.sessionId,
      role: "tenant_operator",
      requestId: "integration-transfer-accept",
    });
    const transferResults = await Promise.all([
      ownership.accept(targetContext, { transferId: initiated.transferId, token: transferToken }, mfaTargetSession.reauthenticatedAt, mfaTargetSession.mfaVerifiedAt),
      ownership.accept(targetContext, { transferId: initiated.transferId, token: transferToken }, mfaTargetSession.reauthenticatedAt, mfaTargetSession.mfaVerifiedAt),
    ]);
    expect(transferResults.filter((result) => result.status === "accepted")).toHaveLength(1);
    const ownerState = await adminClient!<{ id: string; role: string }[]>`
      SELECT id, role FROM tenancy.memberships
      WHERE tenant_id = ${verified.tenantId}::uuid AND status = 'active'
      ORDER BY id
    `;
    expect(ownerState.filter((membership) => membership.role === "tenant_master_admin"))
      .toEqual([{ id: acceptedInvitation.membershipId, role: "tenant_master_admin" }]);
    expect(ownerState.find((membership) => membership.id === ownerMembership[0]!.id)?.role).toBe("tenant_admin");
    await expect(sessions.current(ownerLogin.sessionToken)).resolves.toBeNull();
    await expect(sessions.current(targetLogin.sessionToken)).resolves.toBeNull();
    const mfaLogin = await login({
      email: invitedEmail,
      password: "invited operator password",
      requestId: "integration-mfa-login-password",
    });
    expect(mfaLogin.status).toBe("mfa_required");
    if (mfaLogin.status !== "mfa_required") throw new Error("Expected tenant MFA challenge.");
    const mfaAuthenticated = await tenantMfa.completeLogin({
      challengeToken: mfaLogin.challengeToken,
      code: generateTotpCode(targetSecret!),
      requestId: "integration-mfa-login-code",
    });
    expect(mfaAuthenticated.status).toBe("authenticated");
    if (mfaAuthenticated.status !== "authenticated") throw new Error("Expected MFA-authenticated tenant session.");
    await expect(sessions.current(mfaAuthenticated.sessionToken)).resolves.toMatchObject({
      mfaVerifiedAt: expect.any(Date),
    });

    const rateKey = randomBytes(32);
    const rateNow = new Date();
    await expect(store.consumeRateLimit({
      scope: "integration-login",
      keyHash: rateKey,
      limit: 2,
      windowMs: 60_000,
      now: rateNow,
    })).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    await expect(store.consumeRateLimit({
      scope: "integration-login",
      keyHash: rateKey,
      limit: 2,
      windowMs: 60_000,
      now: rateNow,
    })).resolves.toEqual({ allowed: true, retryAfterSeconds: 0 });
    const denied = await store.consumeRateLimit({
      scope: "integration-login",
      keyHash: rateKey,
      limit: 2,
      windowMs: 60_000,
      now: rateNow,
    });
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterSeconds).toBeGreaterThan(0);

    const delivered: string[] = [];
    const deliveryResult = await runEmailBatch(
      new PostgresEmailOutboxStore(workerClient!),
      { async send(message) { delivered.push(message.to); } },
      emailEnvelopeKey,
      { batchSize: 20 },
    );
    expect(deliveryResult.failed).toBe(0);
    expect(deliveryResult.sent).toBeGreaterThanOrEqual(4);
    expect(delivered).toContain(email.toLowerCase());
    expect(delivered).toContain(invitedEmail);
  });

  it("denies a second registration and fails verification closed after its linked draft expires", async () => {
    const requestHashKey = randomBytes(32);
    const emailEnvelopeKey = randomBytes(32);
    const service = createRegistrationService(new PostgresAuthStore(authClient!), {
      publicAppUrl: "https://signup.example.test",
      legalVersions: { termsVersion: "terms-test-1", privacyVersion: "privacy-test-1" },
      requestHashKey,
      emailEnvelopeKey,
    });
    const builderSessionId = randomUUID();
    const builderDraftId = randomUUID();
    const expiresAt = new Date(Date.now() + 60 * 60 * 1_000);
    await adminClient!`
      INSERT INTO builder.anonymous_sessions (id, issued_at, expires_at, last_seen_at)
      VALUES (${builderSessionId}::uuid, now(), ${expiresAt}, now())
    `;
    await adminClient!`
      INSERT INTO builder.drafts (
        id, session_id, product_family, plan_key, state_json, expires_at
      ) VALUES (
        ${builderDraftId}::uuid, ${builderSessionId}::uuid, 'flow', 'flowbot_basic',
        ${adminClient!.json({ schemaVersion: 1, locale: "th", configuration: { botName: "Expiring draft" } })},
        ${expiresAt}
      )
    `;
    const firstKey = randomUUID();
    const base = {
      name: "Draft Owner",
      businessName: "Draft Business",
      password: "integration password 456",
      locale: "en" as const,
      timezone: "Asia/Bangkok",
      selectedPlanKey: "flowbot_basic" as const,
      termsVersion: "terms-test-1",
      privacyVersion: "privacy-test-1",
      acceptTerms: true as const,
      acceptPrivacy: true as const,
    };
    await expect(service.register({ ...base, idempotencyKey: firstKey, email: `first-${randomUUID()}@example.test` }, { builderSessionId }))
      .resolves.toMatchObject({ accepted: true });
    await expect(service.register({ ...base, idempotencyKey: randomUUID(), email: `second-${randomUUID()}@example.test` }, { builderSessionId }))
      .resolves.toMatchObject({ accepted: false, status: "builder_draft_unavailable" });

    const outbox = await adminClient!<{ payload_ciphertext: string }[]>`
      SELECT payload_ciphertext FROM operations.outbox
      WHERE aggregate_id = (SELECT id FROM identity.signup_intents WHERE idempotency_key = ${firstKey}::uuid)
    `;
    const payload = openJson<{ verificationUrl: string }>(outbox[0]!.payload_ciphertext, emailEnvelopeKey);
    const token = new URLSearchParams(new URL(payload.verificationUrl).hash.slice(1)).get("token")!;
    await adminClient!`UPDATE builder.drafts SET expires_at = now() - interval '1 second' WHERE id = ${builderDraftId}::uuid`;
    await adminClient!`UPDATE builder.anonymous_sessions SET expires_at = now() - interval '1 second' WHERE id = ${builderSessionId}::uuid`;
    await expect(service.verify({ token, requestId: "expired-builder-verify" }))
      .resolves.toEqual({ status: "builder_draft_expired" });
    const provisioned = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM identity.signup_intents
      WHERE idempotency_key = ${firstKey}::uuid AND status = 'provisioned'
    `;
    expect(provisioned[0]?.count).toBe(0);
  });
});
