import { createHash, randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { createTenantContext } from "@djay/tenancy";
import { AnonymousBuilderStore } from "./anonymous-builder-store";
import { AiChatStore } from "./ai-chat-store";
import { createDatabaseClient } from "./client";
import { FlowBotStore } from "./flowbot-store";
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
    const tenantId = randomUUID();
    const membershipId = randomUUID();
    const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
    await adminClient!.begin(async (sql) => {
      await sql`INSERT INTO tenancy.tenants (id, slug, business_name, status, locale, timezone)
        VALUES (${tenantId}::uuid, ${`existing-claim-${tenantId.slice(0, 8)}`},
          'Existing Claim Test', 'active', 'en', 'Asia/Bangkok')`;
      await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
        VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${userId}::uuid,
          'tenant_master_admin', 'active', ${now})`;
      await sql`INSERT INTO tenancy.tenant_onboarding (tenant_id, stage)
        VALUES (${tenantId}::uuid, 'account_created')`;
    });
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
      tenantId,
      userId,
      membershipId,
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
      subscriptions: number; snapshots: number; quotas: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.builder_draft_claims
          WHERE source_session_id = ${sessionId}::uuid) AS claims,
        (SELECT count(*)::int FROM billing.purchase_intents
          WHERE tenant_id = ${command.tenantId}::uuid AND plan_key = 'ai_chat_basic' AND status = 'open') AS intents,
        (SELECT count(*)::int FROM tenancy.audit_logs
          WHERE tenant_id = ${command.tenantId}::uuid AND action = 'tenant.builder_draft_claimed') AS audits,
        (SELECT count(*)::int FROM tenancy.product_subscriptions
          WHERE tenant_id = ${command.tenantId}::uuid AND product_key = 'ai_chat' AND status = 'pending') AS subscriptions,
        (SELECT count(*)::int FROM tenancy.entitlement_snapshots snapshot
          JOIN tenancy.product_subscriptions subscription ON subscription.id = snapshot.subscription_id
          WHERE snapshot.tenant_id = ${command.tenantId}::uuid AND subscription.product_key = 'ai_chat') AS snapshots,
        (SELECT count(*)::int FROM tenancy.quota_accounts quota
          JOIN tenancy.product_subscriptions subscription ON subscription.id = quota.subscription_id
          WHERE quota.tenant_id = ${command.tenantId}::uuid AND subscription.product_key = 'ai_chat') AS quotas,
        (SELECT state_json #>> '{configuration,botName}' FROM tenancy.builder_draft_claims
          WHERE source_session_id = ${sessionId}::uuid) AS bot_name,
        (SELECT commerce_intent FROM billing.purchase_intents
          WHERE tenant_id = ${command.tenantId}::uuid AND plan_key = 'ai_chat_basic' AND status = 'open'
          ORDER BY created_at DESC LIMIT 1) AS commerce_intent
    `;
    expect(evidence[0]).toEqual({
      claims: 1, intents: 1, audits: 1, bot_name: "Existing Account Bot", commerce_intent: "trial",
      subscriptions: 1, snapshots: 1, quotas: 1,
    });

    const workspace = new TenantWorkspaceStore(tenantClient!);
    const tenantContext = createTenantContext({
      tenantId: command.tenantId, userId: command.userId, membershipId: command.membershipId,
      requestId: command.requestId, sessionId: randomUUID(), role: "tenant_master_admin",
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
      template: "lead",
      identity: { botName: "Preserved Builder Flow", languageMode: "customer-choice",
        greetingEn: "Welcome", greetingTh: "ยินดีต้อนรับ", brandColor: "#126149", position: "Bottom left",
        businessHours: "Monday-Friday 09:00-17:00", handoverContact: "Shared inbox", privacyUrl: "https://example.test/privacy" },
      lead: { fields: [{ label: "Email", type: "email", required: true }], consent: "I agree to follow-up." },
      handover: { team: "Shared inbox", fallbackEn: "A person can help.", fallbackTh: "ทีมงานช่วยได้", outsideHours: "We will reply during business hours." },
      widget: { domain: "https://example.test", openOnLoad: false },
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
    const flowbot = new FlowBotStore(tenantClient!);
    const botId = evidence[0]!.materialized_bot_id!;
    await expect(flowbot.authoringCapabilities(tenantContext)).resolves.toBeNull();
    await expect(flowbot.listBots(tenantContext)).resolves.toEqual([
      expect.objectContaining({ id: botId, status: "draft", draftRevision: 1, deploymentCount: 0 }),
    ]);
    const claimedDraft = await flowbot.getDraft(tenantContext, botId);
    expect(claimedDraft).toMatchObject({ revision: 1, definition: { authoring: {
      templateKey: "lead", identity: { greeting: { en: "Welcome", th: "ยินดีต้อนรับ" }, widgetPosition: "bottom_left" },
      lead: { consent: "I agree to follow-up." }, handover: { teamLabel: "Shared inbox" },
      widget: { domain: "https://example.test", openOnLoad: false },
    } } });
    await expect(flowbot.updateDraft(tenantContext, botId, {
      revision: claimedDraft!.revision, definition: claimedDraft!.definition,
    })).resolves.toEqual({ status: "not_entitled" });
  });

  it("materializes complete claimed Text and Voice configurations without publishing or deploying", async () => {
    const store = new AnonymousBuilderStore(authClient!);
    for (const family of ["text", "voice"] as const) {
      const now = new Date(); const sessionId = randomUUID(); const tenantId = randomUUID(); const membershipId = randomUUID();
      const userId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1";
      await adminClient!.begin(async (sql) => {
        await sql`INSERT INTO tenancy.tenants (id, slug, business_name, status, locale, timezone)
          VALUES (${tenantId}::uuid, ${`${family}-materialization-${tenantId.slice(0, 8)}`},
            ${`${family} Materialization Test`}, 'active', 'en', 'Asia/Bangkok')`;
        await sql`INSERT INTO tenancy.memberships (id, tenant_id, user_id, role, status, accepted_at)
          VALUES (${membershipId}::uuid, ${tenantId}::uuid, ${userId}::uuid,
            'tenant_master_admin', 'active', ${now})`;
        await sql`INSERT INTO tenancy.tenant_onboarding (tenant_id, stage) VALUES (${tenantId}::uuid, 'account_created')`;
      });
      const draft = await store.ensureDraft({ sessionId, issuedAt: now,
        expiresAt: new Date(now.getTime() + 30 * 24 * 60 * 60_000), now });
      const greeting = "Hello, how can I help?"; const disclosure = "I am an AI assistant.";
      const voiceDisclosure = "I am an AI voice assistant and this call may be transcribed.";
      const faqKey = randomUUID();
      const translated = (en: string, th: string) => ({ en, th, sourceEn: en, status: "needs_review", reviewed: false });
      const state = {
        schemaVersion: 1, locale: "en", family, access: { product: family,
          plan: family === "text" ? "ai_chat_basic" : "voice_basic_gen1", intent: family === "text" ? "trial" : "subscribe" },
        templateOrRole: { role: "booking" }, configuration: { textDraft: {
          business: { name: "Siamese Studio", type: "Services", summary: "Appointments", offers: "Consultation",
            hours: "Mon-Fri", contact: "team@example.test", agentObjective: "Collect appointment requests",
            agentBehavior: "Confirm details", agentBoundaries: "Never claim confirmation", faqs: [{ question: "When?", answer: "Weekdays", translationKey: faqKey }] },
          botName: `${family} Booking Assistant`, language: "English and Thai", greeting, tone: "Warm and concise",
          disclosure, neverInvent: "Never invent availability", voice: { disclosure: voiceDisclosure },
          translations: { customerCopy: { greeting: translated(greeting, "สวัสดี มีอะไรให้ช่วย"),
            disclosure: translated(disclosure, "ฉันเป็นผู้ช่วย AI"),
            voiceDisclosure: translated(voiceDisclosure, "ฉันเป็นผู้ช่วยเสียง AI และสายนี้อาจถูกถอดความ") },
            faqs: { [faqKey]: { question: translated("When?", "เปิดเมื่อไร"), answer: translated("Weekdays", "วันธรรมดา") } } },
        } } };
      await expect(store.updateDraft({ sessionId, revision: draft!.revision, schemaVersion: 1, productFamily: family,
        planKey: family === "text" ? "ai_chat_basic" : "voice_basic_gen1", state,
        now: new Date(now.getTime() + 1_000) })).resolves.toMatchObject({ status: "updated" });
      const tokenHash = createHash("sha256").update(`${family}:${sessionId}`).digest();
      await store.issueClaimContinuation({ sessionId, tokenHash, now: new Date(now.getTime() + 2_000),
        expiresAt: new Date(now.getTime() + 15 * 60_000) });
      const requestId = `${family}-materialization-${sessionId}`;
      await expect(store.claimExistingAccountDraft({ tokenHash, tenantId, userId, membershipId, requestId,
        now: new Date(now.getTime() + 3_000) })).resolves.toMatchObject({ status: "claimed" });
      const workspace = new TenantWorkspaceStore(tenantClient!);
      const context = createTenantContext({ tenantId, userId, membershipId, requestId, sessionId: randomUUID(), role: "tenant_master_admin" });
      await expect(workspace.completeMerchantOnboarding(context, { version: 1, acceptedGuidelines: true,
        businessGoal: "book_appointments", industry: "services" })).resolves.toMatchObject({ status: "completed" });
      await expect(workspace.completeMerchantOnboarding(context, { version: 1, acceptedGuidelines: true,
        businessGoal: "book_appointments", industry: "services" })).resolves.toMatchObject({ status: "already_completed" });
      const evidence = await adminClient!<{
        agents: number; drafts: number; versions: number; voice_deployments: number;
        product_family: string; materialized_ai_agent_id: string | null; definition: unknown; audits: number;
      }[]>`SELECT
        (SELECT count(*)::int FROM tenancy.ai_agents WHERE tenant_id = ${tenantId}::uuid) AS agents,
        (SELECT count(*)::int FROM tenancy.ai_playbook_drafts WHERE tenant_id = ${tenantId}::uuid) AS drafts,
        (SELECT count(*)::int FROM tenancy.ai_playbook_versions WHERE tenant_id = ${tenantId}::uuid) AS versions,
        (SELECT count(*)::int FROM tenancy.voice_deployments WHERE tenant_id = ${tenantId}::uuid) AS voice_deployments,
        agent.product_family, claim.materialized_ai_agent_id, playbook.definition_json AS definition,
        (SELECT count(*)::int FROM tenancy.audit_logs WHERE tenant_id = ${tenantId}::uuid
          AND action = 'tenant.builder_ai_materialized') AS audits
        FROM tenancy.builder_draft_claims claim
        JOIN tenancy.ai_agents agent ON agent.tenant_id = claim.tenant_id AND agent.id = claim.materialized_ai_agent_id
        JOIN tenancy.ai_playbook_drafts playbook ON playbook.tenant_id = agent.tenant_id AND playbook.agent_id = agent.id
        WHERE claim.source_session_id = ${sessionId}::uuid`;
      expect(evidence[0]).toMatchObject({ agents: 1, drafts: 1, versions: 0, voice_deployments: 0,
        product_family: family, audits: 1, definition: {
          behaviorInstructions: "Confirm details", behaviorBoundaries: "Never claim confirmation",
          approvedFaqs: [{ question: { en: "When?", th: "เปิดเมื่อไร" }, answer: { en: "Weekdays", th: "วันธรรมดา" } }],
        } });
      expect(evidence[0]?.materialized_ai_agent_id).toMatch(/^[0-9a-f-]{36}$/);
      if (family === "text") {
        const aiChat = new AiChatStore(tenantClient!);
        const agentId = evidence[0]!.materialized_ai_agent_id!;
        await expect(aiChat.authoringCapabilities(context)).resolves.toBeNull();
        await expect(aiChat.listAgents(context)).resolves.toEqual([
          expect.objectContaining({ id: agentId, status: "draft", draftRevision: 1, deploymentCount: 0 }),
        ]);
        const claimedDraft = await aiChat.getDraft(context, agentId);
        expect(claimedDraft).toMatchObject({ revision: 1, definition: {
          behaviorInstructions: "Confirm details", behaviorBoundaries: "Never claim confirmation",
          approvedFaqs: [{ question: { en: "When?", th: "เปิดเมื่อไร" }, answer: { en: "Weekdays", th: "วันธรรมดา" } }],
        } });
        await expect(aiChat.updateDraft(context, agentId, {
          revision: claimedDraft!.revision, definition: claimedDraft!.definition, knowledgeRevisionIds: [],
        })).resolves.toEqual({ status: "not_entitled" });
      }
    }
  });
});
