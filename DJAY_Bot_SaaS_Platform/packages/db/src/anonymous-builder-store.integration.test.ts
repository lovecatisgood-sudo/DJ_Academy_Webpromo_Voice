import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createTenantContext } from "@djay/tenancy";
import { AnonymousBuilderStore } from "./anonymous-builder-store";
import { createDatabaseClient } from "./client";
import { TenantWorkspaceStore } from "./tenant-workspace-store";

const authUrl = process.env.AUTH_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(authUrl && tenantUrl && adminUrl);
const authClient = enabled ? createDatabaseClient(authUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await authClient?.end();
  await tenantClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("anonymous Builder drafts", () => {
  it("persists one versioned draft per signed session with optimistic conflicts", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    const now = new Date("2026-08-17T04:00:00.000Z");
    const expiresAt = new Date("2026-09-16T04:00:00.000Z");
    const sessionId = randomUUID();
    const session = { sessionId, issuedAt: now, expiresAt, now };

    const created = await store.ensureDraft(session);
    expect(created).toMatchObject({ revision: 1, schemaVersion: 1, state: { locale: "th" } });
    await expect(store.ensureDraft({ ...session, now: new Date(now.getTime() + 1_000) }))
      .resolves.toMatchObject({ id: created!.id, revision: 1 });

    const updated = await store.updateDraft({
      sessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: "text",
      planKey: "ai_chat_basic",
      state: { schemaVersion: 1, locale: "en", family: "text", businessProfile: { name: "Siamese" } },
      now: new Date(now.getTime() + 2_000),
    });
    expect(updated).toMatchObject({ status: "updated", draft: { revision: 2, productFamily: "text" } });

    await expect(store.updateDraft({
      sessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: "voice",
      planKey: "voice_basic_gen1",
      state: { schemaVersion: 1, locale: "th", family: "voice" },
      now: new Date(now.getTime() + 3_000),
    })).resolves.toMatchObject({ status: "conflict", draft: { revision: 2, productFamily: "text" } });

    const revisions = await adminClient!<{ revision: number; state: unknown }[]>`
      SELECT revision, state_json AS state
      FROM builder.draft_revisions
      WHERE draft_id = ${created!.id}::uuid
      ORDER BY revision
    `;
    expect(revisions.map((row) => row.revision)).toEqual([1, 2]);
    await expect(tenantClient!`SELECT id FROM builder.drafts WHERE id = ${created!.id}::uuid`)
      .rejects.toThrow();
  });

  it("does not accept altered session authority or an expired session", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    const issuedAt = new Date("2026-08-17T04:00:00.000Z");
    const expiresAt = new Date("2026-09-16T04:00:00.000Z");
    const sessionId = randomUUID();
    await expect(store.ensureDraft({ sessionId, issuedAt, expiresAt, now: issuedAt })).resolves.toBeTruthy();

    await expect(store.ensureDraft({
      sessionId,
      issuedAt: new Date(issuedAt.getTime() + 1_000),
      expiresAt,
      now: new Date(issuedAt.getTime() + 2_000),
    })).resolves.toBeNull();
    await expect(store.updateDraft({
      sessionId,
      revision: 1,
      schemaVersion: 1,
      productFamily: null,
      planKey: null,
      state: { schemaVersion: 1, locale: "th" },
      now: expiresAt,
    })).resolves.toEqual({ status: "unavailable" });
  });

  it("pins and atomically claims an existing-account continuation into one authorized workspace", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    const now = new Date();
    const sessionId = randomUUID();
    const draft = await store.ensureDraft({
      sessionId, issuedAt: now, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000), now,
    });
    await store.updateDraft({
      sessionId, revision: draft!.revision, schemaVersion: 1,
      productFamily: "text", planKey: "ai_chat_basic",
      state: { schemaVersion: 1, locale: "en", access: { product: "text", plan: "ai_chat_basic", intent: "trial" }, configuration: { botName: "Existing Account Bot" } },
      now: new Date(now.getTime() + 1_000),
    });
    const firstHash = createHash("sha256").update("first-continuation").digest();
    const activeHash = createHash("sha256").update("active-continuation").digest();
    await expect(store.issueClaimContinuation({
      sessionId, tokenHash: firstHash, now: new Date(now.getTime() + 2_000),
      expiresAt: new Date(now.getTime() + 15 * 60_000),
    })).resolves.toEqual({ status: "issued", draftRevision: 2 });
    await expect(store.issueClaimContinuation({
      sessionId, tokenHash: activeHash, now: new Date(now.getTime() + 3_000),
      expiresAt: new Date(now.getTime() + 16 * 60_000),
    })).resolves.toEqual({ status: "issued", draftRevision: 2 });
    const command = {
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      requestId: "existing-builder-claim-1",
      now: new Date(now.getTime() + 4_000),
    };
    await expect(store.claimExistingAccountDraft({ ...command, tokenHash: firstHash }))
      .resolves.toEqual({ status: "unavailable" });
    await expect(store.claimExistingAccountDraft({ ...command, tokenHash: activeHash }))
      .resolves.toEqual({ status: "claimed", planKey: "ai_chat_basic" });
    await expect(store.claimExistingAccountDraft({ ...command, tokenHash: activeHash }))
      .resolves.toEqual({ status: "replayed", planKey: "ai_chat_basic" });
    await expect(store.claimExistingAccountDraft({
      ...command, tokenHash: activeHash,
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
    })).resolves.toEqual({ status: "unavailable" });
    const evidence = await adminClient!<{
      claims: number; intents: number; audits: number; bot_name: string; commerce_intent: string;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.builder_draft_claims
          WHERE source_session_id = ${sessionId}::uuid) AS claims,
        (SELECT count(*)::int FROM billing.purchase_intents
          WHERE tenant_id = ${command.tenantId}::uuid AND plan_key = 'ai_chat_basic' AND status = 'open') AS intents,
        (SELECT count(*)::int FROM tenancy.audit_logs
          WHERE tenant_id = ${command.tenantId}::uuid AND action = 'tenant.builder_draft_claimed') AS audits,
        (SELECT state_json #>> '{configuration,botName}' FROM tenancy.builder_draft_claims
          WHERE source_session_id = ${sessionId}::uuid) AS bot_name,
        (SELECT commerce_intent FROM billing.purchase_intents
          WHERE tenant_id = ${command.tenantId}::uuid AND plan_key = 'ai_chat_basic' AND status = 'open'
          ORDER BY created_at DESC LIMIT 1) AS commerce_intent
    `;
    expect(evidence[0]).toEqual({ claims: 1, intents: 1, audits: 1, bot_name: "Existing Account Bot", commerce_intent: "trial" });

    const workspace = new TenantWorkspaceStore(tenantClient!);
    const tenantContext = createTenantContext({
      tenantId: command.tenantId, userId: command.userId, membershipId: command.membershipId,
      requestId: command.requestId, sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13", role: "tenant_master_admin",
    });
    await expect(workspace.completeMerchantOnboarding(tenantContext, {
      version: 1, acceptedGuidelines: true, businessGoal: "capture_leads", industry: "services",
    })).resolves.toMatchObject({
      status: "completed",
      onboarding: { accountOnboarding: { complete: true, version: 1, claimedProduct: "ai_chat" } },
    });
    const firstCompletion = await adminClient!<{ completed_at: Date; audits: number; first_product: string }[]>`
      SELECT onboarding.preferences_completed_at AS completed_at, onboarding.first_product,
        (SELECT count(*)::int FROM tenancy.audit_logs audit
          WHERE audit.tenant_id = onboarding.tenant_id
            AND audit.action = 'tenant.merchant_onboarding_completed') AS audits
      FROM tenancy.tenant_onboarding onboarding WHERE onboarding.tenant_id = ${command.tenantId}::uuid
    `;
    await expect(workspace.completeMerchantOnboarding(tenantContext, {
      version: 1, acceptedGuidelines: true, businessGoal: "book_appointments", industry: "education",
    })).resolves.toMatchObject({ status: "already_completed" });
    const repeatedCompletion = await adminClient!<{ completed_at: Date; audits: number; first_product: string }[]>`
      SELECT onboarding.preferences_completed_at AS completed_at, onboarding.first_product,
        (SELECT count(*)::int FROM tenancy.audit_logs audit
          WHERE audit.tenant_id = onboarding.tenant_id
            AND audit.action = 'tenant.merchant_onboarding_completed') AS audits
      FROM tenancy.tenant_onboarding onboarding WHERE onboarding.tenant_id = ${command.tenantId}::uuid
    `;
    expect(repeatedCompletion[0]).toEqual(firstCompletion[0]);
    expect(repeatedCompletion[0]).toMatchObject({ audits: 1, first_product: "ai_chat" });
  });

  it("materializes a claimed Flow graph as one non-live tenant draft during one-time onboarding", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    const now = new Date();
    const sessionId = randomUUID();
    const tenantId = randomUUID();
    const membershipId = randomUUID();
    const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
    await adminClient!.begin(async (sql) => {
      await sql`
        INSERT INTO tenancy.tenants (id, slug, business_name, status, locale, timezone)
        VALUES (${tenantId}::uuid, ${`flow-materialization-${tenantId.slice(0, 8)}`},
          'Flow Materialization Test', 'active', 'en', 'Asia/Bangkok')
      `;
      await sql`
        INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${userId}::uuid,
          'tenant_master_admin', 'active', ${now})
      `;
      await sql`
        INSERT INTO tenancy.tenant_onboarding (tenant_id, stage)
        VALUES (${tenantId}::uuid, 'account_created')
      `;
    });
    const draft = await store.ensureDraft({
      sessionId, issuedAt: now, expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000), now,
    });
    const flowDraft = {
      identity: { botName: "Preserved Builder Flow", languageMode: "customer-choice" },
      entryId: "welcome",
      nodes: [
        { id: "welcome", type: "options", title: "Welcome", en: "How can we help?", th: "ให้เราช่วยเรื่องใด?", x: 20, y: 40,
          keywords: ["hello"], next: null, fields: [], options: [
            { en: "Talk to staff", th: "คุยกับทีมงาน", target: "handover" },
          ] },
        { id: "handover", type: "handover", title: "Human handover", en: "Our team will continue.", th: "ทีมงานจะดูแลต่อ", x: 300, y: 40,
          keywords: ["human"], next: null, fields: [], options: [] },
      ],
    };
    await expect(store.updateDraft({
      sessionId, revision: draft!.revision, schemaVersion: 1, productFamily: "flow", planKey: "flowbot_basic",
      state: {
        schemaVersion: 1, locale: "en", family: "flow",
        access: { product: "flow", plan: "flowbot_basic", intent: "subscribe" },
        configuration: { flowDraft, flowUi: { configured: true, version: 1 } },
      },
      now: new Date(now.getTime() + 1_000),
    })).resolves.toMatchObject({ status: "updated", draft: { revision: 2 } });
    const tokenHash = createHash("sha256").update(`flow-materialization:${sessionId}`).digest();
    await expect(store.issueClaimContinuation({
      sessionId, tokenHash, now: new Date(now.getTime() + 2_000), expiresAt: new Date(now.getTime() + 15 * 60_000),
    })).resolves.toEqual({ status: "issued", draftRevision: 2 });
    const command = {
      tenantId,
      userId,
      membershipId,
      requestId: `flow-materialization-${sessionId}`,
      now: new Date(now.getTime() + 3_000),
    };
    await expect(store.claimExistingAccountDraft({ ...command, tokenHash }))
      .resolves.toEqual({ status: "claimed", planKey: "flowbot_basic" });

    const workspace = new TenantWorkspaceStore(tenantClient!);
    const tenantContext = createTenantContext({
      tenantId: command.tenantId, userId: command.userId, membershipId: command.membershipId,
      requestId: command.requestId, sessionId: randomUUID(), role: "tenant_master_admin",
    });
    await expect(workspace.completeMerchantOnboarding(tenantContext, {
      version: 1, acceptedGuidelines: true, businessGoal: "capture_leads", industry: "services",
    })).resolves.toMatchObject({ status: "completed", onboarding: { accountOnboarding: { claimedProduct: "flowbot" } } });
    await expect(workspace.completeMerchantOnboarding(tenantContext, {
      version: 1, acceptedGuidelines: true, businessGoal: "capture_leads", industry: "services",
    })).resolves.toMatchObject({ status: "already_completed" });

    const evidence = await adminClient!<{
      bots: number; drafts: number; published_versions: number; materialized_bot_id: string | null;
      bot_name: string; node_types: string[]; audits: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.flow_bots bot WHERE bot.tenant_id = ${command.tenantId}::uuid) AS bots,
        (SELECT count(*)::int FROM tenancy.flow_drafts target WHERE target.tenant_id = ${command.tenantId}::uuid) AS drafts,
        (SELECT count(*)::int FROM tenancy.flow_versions version WHERE version.tenant_id = ${command.tenantId}::uuid) AS published_versions,
        claim.materialized_flow_bot_id AS materialized_bot_id,
        (SELECT name FROM tenancy.flow_bots bot WHERE bot.id = claim.materialized_flow_bot_id) AS bot_name,
        (SELECT array_agg(node.value->>'type' ORDER BY node.value->>'type')
          FROM tenancy.flow_drafts target, LATERAL jsonb_each(target.definition_json->'nodes') node
          WHERE target.bot_id = claim.materialized_flow_bot_id) AS node_types,
        (SELECT count(*)::int FROM tenancy.audit_logs audit
          WHERE audit.tenant_id = claim.tenant_id AND audit.action = 'tenant.builder_flow_materialized') AS audits
      FROM tenancy.builder_draft_claims claim WHERE claim.source_session_id = ${sessionId}::uuid
    `;
    expect(evidence[0]).toMatchObject({
      bots: 1, drafts: 1, published_versions: 0, bot_name: "Preserved Builder Flow",
      node_types: ["handover", "options"], audits: 1,
    });
    expect(evidence[0]?.materialized_bot_id).toMatch(/^[0-9a-f-]{36}$/);
  });
});
