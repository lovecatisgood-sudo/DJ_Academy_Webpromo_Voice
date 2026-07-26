import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client";
import { FlowBotStore } from "./flowbot-store";
import { FlowSocialConnectionStore } from "./flowbot-social-store";

/**
 * CHN-004 / CHN-005 — one included social channel per subscription, extras paid.
 *
 * Runs against the disposable PostgreSQL 16 container from
 * `scripts/test-db-integration.sh`, never a hosted database.
 *
 * Fixture rules, matching the sibling suites: the only tenants that exist are the two in
 * `packages/db/tests/seed.sql`, and `packages/db/tests/p9-restore-assert.sql` pins that
 * count at exactly 2 — so this suite creates no tenants and no memberships, and
 * provisions only subscriptions, entitlement snapshots, and add-ons for a seeded tenant.
 * Suites share one database, so CHN-004 state is reset before each case rather than
 * assumed clean.
 */

const enabled = Boolean(process.env.TENANT_DATABASE_URL && process.env.ADMIN_DATABASE_URL);
const envelopeKey = Buffer.alloc(32, 91);

// Seeded tenant A, with its seeded master-admin membership and user.
const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const membershipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
const premiumPlanVersionId = "62000000-0000-4000-8000-000000000102";

let tenantClient: DatabaseClient | null = null;
let adminClient: DatabaseClient | null = null;
let subscriptionId = "";
let botId = "";

function context(label: string) {
  return createTenantContext({
    tenantId, userId, membershipId, sessionId: randomUUID(),
    role: "tenant_master_admin", requestId: `chn004-${label}-${randomUUID()}`,
  });
}

/** Premium FlowBot authority with room for several channels, so CHN-004 is what is under test. */
async function provisionSocialAuthority() {
  subscriptionId = randomUUID();
  const snapshotId = randomUUID();
  const resolved = {
    tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_premium",
    planVersionId: premiumPlanVersionId, accessMode: "active",
    // Same entitlement set the FlowBot social sibling suite provisions, which is the
    // shape FlowBotStore.createBot actually requires.
    entitlements: {
      "channel.web": true, "channel.social": true, "ai.enabled": false,
      "flow.nodes.core": true, "flow.nodes.advanced": true, "flow.forms": true,
      "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
      "flow.variables": true, "flow.delays": true, "flow.subflows": true,
      "flow.business_hours": true, "flow.team_routing": true, "flow.webhook": "approved",
      "integration.google_sheets": true, "integration.external_api": "basic",
      "branding.remove": true, "analytics.level": "advanced", "support.level": "priority",
    },
    allowances: { flow_execution: 100_000 }, overageRatesMinor: { flow_execution: null },
    // Deliberately generous: the connection-count limit must not mask a CHN-004 refusal.
    limits: { active_bots: 3, workspaces: 1, topics: 500, seats: 3, social_channels: 5 },
    resolvedAt: new Date().toISOString(),
  };
  await adminClient!`
    UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'
  `;
  await adminClient!`
    INSERT INTO tenancy.product_subscriptions
      (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${premiumPlanVersionId}::uuid,
      'active', now(), now() + interval '1 year')
  `;
  await adminClient!`
    INSERT INTO tenancy.entitlement_snapshots
      (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
       access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot',
      ${premiumPlanVersionId}::uuid, 'active', 'active',
      ${adminClient!.json(resolved)}, digest(${snapshotId}, 'sha256'))
  `;
  await adminClient!`
    INSERT INTO tenancy.quota_accounts
      (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
       included_quantity, safety_cap_quantity)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution',
      now() - interval '1 minute', now() + interval '1 year', 100000, 100000)
  `;
}

/** A published bot, required before a social connection may be created. */
async function provisionPublishedBot() {
  await adminClient!`
    UPDATE tenancy.flow_bots SET status = 'archived', updated_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND status <> 'archived'
  `;
  const flow = new FlowBotStore(tenantClient!);
  const created = await flow.createBot(context("bot"), { name: "CHN-004 bot", defaultLanguage: "en" });
  if (created.status !== "created") throw new Error(`Expected a bot, got ${created.status}`);
  const draft = await flow.getDraft(context("draft"), created.botId);
  const end = randomUUID();
  await flow.updateDraft(context("draft"), created.botId, {
    revision: draft!.revision,
    definition: {
      schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: end, keywords: [],
      nodes: { [end]: { id: end, type: "end", title: "Done", message: { th: "ปิด", en: "Closed" } } },
    },
  });
  await flow.publish(context("publish"), created.botId);
  botId = created.botId;
}

async function resetChannelState() {
  await adminClient!`DELETE FROM tenancy.flow_social_connections WHERE tenant_id = ${tenantId}::uuid`;
  await adminClient!`DELETE FROM tenancy.subscription_social_channels WHERE tenant_id = ${tenantId}::uuid`;
  await adminClient!`DELETE FROM tenancy.social_channel_change_approvals WHERE tenant_id = ${tenantId}::uuid`;
  await adminClient!`
    DELETE FROM tenancy.subscription_add_ons
    WHERE tenant_id = ${tenantId}::uuid AND add_on_key = 'additional_social_channel'
  `;
}

async function admission(channel: string): Promise<string> {
  const rows = await adminClient!<{ decision: string }[]>`
    SELECT tenancy.social_channel_admission(${tenantId}::uuid, 'flowbot', ${channel}) AS decision
  `;
  return rows[0]?.decision ?? "missing";
}

async function claimSlot(channel: string): Promise<string> {
  const rows = await adminClient!<{ outcome: string }[]>`
    SELECT tenancy.claim_included_social_channel(
      ${tenantId}::uuid, 'flowbot', ${channel}, ${membershipId}::uuid
    ) AS outcome
  `;
  return rows[0]?.outcome ?? "missing";
}

async function slotRow() {
  const rows = await adminClient!<{ channel: string; changeAllowedAt: Date; chosenAt: Date }[]>`
    SELECT channel, change_allowed_at AS "changeAllowedAt", chosen_at AS "chosenAt"
    FROM tenancy.subscription_social_channels
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot'
  `;
  return rows[0] ?? null;
}

async function grantAddOn(quantity = 1) {
  await adminClient!`
    INSERT INTO tenancy.subscription_add_ons
      (tenant_id, subscription_id, add_on_key, quantity, status, effective_from)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'additional_social_channel',
      ${quantity}, 'active', now() - interval '1 minute')
    ON CONFLICT (tenant_id, subscription_id, add_on_key)
    DO UPDATE SET status = 'active', quantity = ${quantity}, effective_until = NULL
  `;
}

/**
 * Age the slot so its cooldown has elapsed. `chosen_at` moves too: the table enforces
 * CHECK (change_allowed_at >= chosen_at), so a cooldown cannot end before it started.
 */
async function expireCooldown() {
  await adminClient!`
    UPDATE tenancy.subscription_social_channels
    SET chosen_at = now() - interval '31 days', change_allowed_at = now() - interval '1 day'
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot'
  `;
}

/**
 * A platform user to author an operator approval. Created here rather than depending on
 * the platform-identity suite having run first, so this suite is order-independent.
 * `platform.users` has no seeded-count invariant, unlike `tenancy.tenants`.
 */
async function operatorPlatformUserId(): Promise<string> {
  await adminClient!`
    INSERT INTO platform.users (email_normalized, display_name, password_hash, status)
    VALUES ('chn004-operator@example.test', 'CHN-004 operator', 'not-a-real-hash', 'active')
    ON CONFLICT (email_normalized) DO NOTHING
  `;
  const rows = await adminClient!<{ id: string }[]>`
    SELECT id FROM platform.users WHERE email_normalized = 'chn004-operator@example.test'
  `;
  if (!rows[0]) throw new Error("failed to provision a platform operator user");
  return rows[0].id;
}

/** The active deployment of the published fixture bot, for direct-INSERT cases. */
async function activeDeploymentId(): Promise<string> {
  const rows = await adminClient!<{ id: string }[]>`
    SELECT id FROM tenancy.flow_deployments
    WHERE tenant_id = ${tenantId}::uuid AND bot_id = ${botId}::uuid AND status = 'active'
    LIMIT 1
  `;
  // Thrown rather than asserted: `expect(...).toBeDefined()` does not narrow for
  // TypeScript, so the value could still be `string | undefined` at the call site.
  if (!rows[0]) throw new Error("published fixture bot has no active deployment");
  return rows[0].id;
}

function messengerCredentials() {
  return {
    channel: "messenger" as const, pageAccessToken: "page-access-token-value-1234",
    appSecret: "page-app-secret-value-12345678", verifyToken: "page-verify-token-value-1234",
    pageId: `page-${randomUUID()}`,
  };
}

beforeAll(async () => {
  if (!enabled) return;
  tenantClient = createDatabaseClient(process.env.TENANT_DATABASE_URL!);
  adminClient = createDatabaseClient(process.env.ADMIN_DATABASE_URL!);
  await provisionSocialAuthority();
  await provisionPublishedBot();
});

afterAll(async () => {
  await Promise.all([tenantClient?.end(), adminClient?.end()]);
});

beforeEach(async () => {
  if (!enabled) return;
  await resetChannelState();
});

describe.runIf(enabled)("CHN-004 included social channel", () => {
  it("has migration 0084 applied, so every assertion below is real", async () => {
    const rows = await adminClient!<{ present: boolean; triggers: number }[]>`
      SELECT to_regprocedure('tenancy.social_channel_admission(uuid, text, text)') IS NOT NULL AS present,
             (SELECT count(*)::int FROM pg_trigger WHERE tgname LIKE '%channel_admission%') AS triggers
    `;
    expect(rows[0]?.present).toBe(true);
    expect(rows[0]?.triggers).toBe(2);
  });

  it("spends the included slot on the first channel connected, and starts the cooldown", async () => {
    expect(await admission("line")).toBe("included");
    const connections = new FlowSocialConnectionStore(tenantClient!);
    const created = await connections.create(context("first"), {
      botId, channel: "line", name: "First LINE OA", externalAccountRef: `line-${randomUUID()}`,
      credentials: { channel: "line", channelId: "1656226113", channelSecret: "line-channel-secret-value" },
      envelopeKey,
    });
    expect(created.status).toBe("created");

    // The store claimed the slot, and the CHN-005 cooldown is running.
    const slot = await slotRow();
    expect(slot?.channel).toBe("line");
    expect(slot!.changeAllowedAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("keeps admitting the channel that holds the slot, and refuses a different one", async () => {
    await claimSlot("line");
    expect(await admission("line")).toBe("included");
    expect(await admission("messenger")).toBe("cooldown_active");
  });

  it("refuses a second different channel end-to-end through the store", async () => {
    await claimSlot("line");
    const connections = new FlowSocialConnectionStore(tenantClient!);
    const refused = await connections.create(context("second"), {
      botId, channel: "messenger", name: "Second channel",
      externalAccountRef: `page-${randomUUID()}`,
      credentials: messengerCredentials(), envelopeKey,
    });
    expect(refused.status).toBe("channel_not_admitted");
    expect(refused).toMatchObject({ decision: "cooldown_active" });
    // Nothing was persisted for the refused channel.
    const rows = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM tenancy.flow_social_connections
      WHERE tenant_id = ${tenantId}::uuid AND channel = 'messenger'
    `;
    expect(rows[0]?.count).toBe(0);
  });

  it("accepts a second different channel once an add-on is active, without moving the slot", async () => {
    await claimSlot("line");
    expect(await admission("messenger")).toBe("cooldown_active");
    await grantAddOn(1);
    expect(await admission("messenger")).toBe("add_on");

    const connections = new FlowSocialConnectionStore(tenantClient!);
    const created = await connections.create(context("addon"), {
      botId, channel: "messenger", name: "Paid extra channel",
      externalAccountRef: `page-${randomUUID()}`,
      credentials: messengerCredentials(), envelopeKey,
    });
    expect(created.status).toBe("created");
    // A paid extra must not take over the included slot, or the slot would be freed for
    // yet another unpaid channel.
    expect((await slotRow())?.channel).toBe("line");
  });

  it("admits a channel change once the cooldown has elapsed, and restarts it", async () => {
    await claimSlot("line");
    expect(await admission("messenger")).toBe("cooldown_active");
    await expireCooldown();
    expect(await admission("messenger")).toBe("cooldown_elapsed");
    expect(await claimSlot("messenger")).toBe("moved");
    const slot = await slotRow();
    expect(slot?.channel).toBe("messenger");
    expect(slot!.changeAllowedAt.getTime()).toBeGreaterThan(Date.now());
    expect(await admission("line")).toBe("cooldown_active");
  });

  it("admits an operator-approved change and consumes the approval exactly once", async () => {
    await claimSlot("line");
    const approvedBy = await operatorPlatformUserId();
    await adminClient!`
      INSERT INTO tenancy.social_channel_change_approvals
        (tenant_id, subscription_id, product_key, channel, reason,
         approved_by_platform_user_id, expires_at)
      VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'messenger',
        'merchant migrated their Official Account', ${approvedBy}::uuid,
        now() + interval '3 days')
    `;
    expect(await admission("messenger")).toBe("operator_approved");

    expect(await claimSlot("messenger")).toBe("moved");
    const approvals = await adminClient!<{ consumedAt: Date | null }[]>`
      SELECT consumed_at AS "consumedAt" FROM tenancy.social_channel_change_approvals
      WHERE tenant_id = ${tenantId}::uuid AND channel = 'messenger'
    `;
    expect(approvals[0]?.consumedAt).not.toBeNull();

    // Consumed, so it cannot authorise moving back.
    expect(await admission("line")).toBe("cooldown_active");
  });

  it("keeps an already-active connection working when enforcement arrives", async () => {
    // This is the property that decides whether 0084 is safe to deploy to tenants who
    // already have several connections. A row created before enforcement existed is
    // reproduced by inserting with the trigger disabled; everything afterwards runs with
    // the trigger live.
    await claimSlot("line");
    const deploymentId = await activeDeploymentId();
    const legacyId = randomUUID();
    await adminClient!`
      ALTER TABLE tenancy.flow_social_connections
      DISABLE TRIGGER flow_social_connections_channel_admission
    `;
    try {
      await adminClient!`
        INSERT INTO tenancy.flow_social_connections
          (id, tenant_id, bot_id, deployment_id, channel, name, external_account_ref,
           credential_ciphertext, webhook_key_hash, created_by_membership_id)
        VALUES (${legacyId}::uuid, ${tenantId}::uuid, ${botId}::uuid, ${deploymentId}::uuid,
          'messenger', 'Legacy channel', ${`page-legacy-${randomUUID()}`}, ${"x".repeat(64)},
          ${Buffer.alloc(32, 11)}, ${membershipId}::uuid)
      `;
    } finally {
      await adminClient!`
        ALTER TABLE tenancy.flow_social_connections
        ENABLE TRIGGER flow_social_connections_channel_admission
      `;
    }

    // It could not be created today, which is what makes it a grandfathering case.
    expect(await admission("messenger")).toBe("cooldown_active");

    // It stays active, and the operations a live connection depends on still succeed.
    const store = new FlowSocialConnectionStore(tenantClient!);
    await expect(store.recordHealth(context("legacy-health"), {
      connectionId: legacyId, healthy: true, reauthorizationRequired: false, safeErrorCode: null,
    })).resolves.toMatchObject({ status: "checked", healthStatus: "healthy" });

    const rows = await adminClient!<{ status: string }[]>`
      SELECT status FROM tenancy.flow_social_connections WHERE id = ${legacyId}::uuid
    `;
    expect(rows[0]?.status).toBe("active");

    // A health check that flags reauthorization moves status away from 'active', which the
    // trigger must also allow -- it only guards transitions INTO 'active'.
    await expect(store.recordHealth(context("legacy-reauth"), {
      connectionId: legacyId, healthy: false, reauthorizationRequired: true,
      safeErrorCode: "credential_reauthorization_required",
    })).resolves.toMatchObject({ status: "checked", connectionStatus: "reauthorization_required" });

    // And revoking it still works.
    await expect(store.revoke(context("legacy-revoke"), legacyId)).resolves.toEqual({ status: "revoked" });
  });

  it("refuses the write itself, so no code path can bypass the entitlement", async () => {
    await claimSlot("line");
    const deploymentId = await activeDeploymentId();
    // A direct INSERT as the table owner, bypassing every store and every route, must
    // still be refused — that is the point of enforcing at write time.
    await expect(adminClient!`
      INSERT INTO tenancy.flow_social_connections
        (tenant_id, bot_id, deployment_id, channel, name, external_account_ref,
         credential_ciphertext, webhook_key_hash, created_by_membership_id)
      VALUES (${tenantId}::uuid, ${botId}::uuid, ${deploymentId}::uuid, 'messenger',
        'Bypass attempt', ${`page-bypass-${randomUUID()}`}, ${"x".repeat(64)},
        ${Buffer.alloc(32, 7)}, ${membershipId}::uuid)
    `).rejects.toThrow(/social_channel_not_admitted/);
  });
});
