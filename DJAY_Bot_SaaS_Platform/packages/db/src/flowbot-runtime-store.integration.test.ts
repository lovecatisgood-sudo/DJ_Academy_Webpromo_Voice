import { createHash, randomUUID } from "node:crypto";
import { hashOpaqueToken, openJson } from "@djay/auth";
import type { FlowSnapshot } from "@djay/flowbot-domain";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { FlowbotRuntimeStore } from "./flowbot-runtime-store";
import { FlowBotStore } from "./flowbot-store";
import { FlowbotWorkerStore } from "./flowbot-worker-store";
import { FlowbotNotificationWorkerStore, TenantFlowbotNotificationStore } from "./flowbot-notification-store";
import { PlatformFlowbotIntegrationStore, TenantFlowbotIntegrationStore } from "./flowbot-integration-store";

const runtimeUrl = process.env.FLOWBOT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const enabled = Boolean(runtimeUrl && adminUrl && workerUrl && tenantUrl);
const runtimeClient = enabled ? createDatabaseClient(runtimeUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;

afterAll(async () => { await runtimeClient?.end(); await adminClient?.end(); await workerClient?.end(); await tenantClient?.end(); });

describe.runIf(enabled)("P4 FlowBot restricted public runtime", () => {
  it("enforces origin and session boundaries while persisting one idempotent shared-domain journey", async () => {
    const tenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10";
    const membershipId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11";
    const subscriptionId = randomUUID(); const snapshotId = randomUUID();
    const botId = randomUUID(); const versionId = randomUUID(); const deploymentId = randomUUID();
    const rootId = randomUUID(); const formId = randomUUID(); const endId = randomUUID();
    const deploymentKey = `djay_flow_${Buffer.from(randomUUID()).toString("base64url")}`;
    const snapshot: FlowSnapshot = {
      schemaVersion: 1,
      flowVersionId: versionId,
      rootNodeId: rootId,
      keywords: [],
      nodes: {
        [rootId]: { id: rootId, type: "message", title: "Welcome", content: { th: "ยินดีต้อนรับ", en: "Welcome" }, nextNodeId: formId },
        [formId]: { id: formId, type: "form", title: "Contact", prompt: { th: "ข้อมูลติดต่อ", en: "Contact details" }, fields: [
          { key: "name", label: { th: "ชื่อ", en: "Name" }, type: "text", required: true },
          { key: "email", label: { th: "อีเมล", en: "Email" }, type: "email", required: true },
        ], nextNodeId: endId },
        [endId]: { id: endId, type: "end", title: "Done", message: { th: "ขอบคุณ", en: "Thank you" } },
      },
    };
    const resolved = {
      tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_basic",
      planVersionId: "62000000-0000-4000-8000-000000000001", accessMode: "active",
      entitlements: { "ai.enabled": false, "channel.web": true, "flow.nodes.core": true, "flow.nodes.advanced": false, "flow.email_notification": true, "branding.remove": false },
      allowances: { flow_execution: 100 }, overageRatesMinor: { flow_execution: null },
      limits: { active_bots: 1, flow_nodes_per_bot: 100, deployments: 1 },
      resolvedAt: new Date().toISOString(),
    };

    await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now() WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'`;
    await adminClient!`INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status, period_start, period_end) VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', '62000000-0000-4000-8000-000000000001', 'active', now(), now() + interval '30 days')`;
    await adminClient!`INSERT INTO tenancy.entitlement_snapshots (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status, access_mode, resolved_json, resolution_hash) VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', '62000000-0000-4000-8000-000000000001', 'active', 'active', ${adminClient!.json(resolved)}, ${createHash("sha256").update(JSON.stringify(resolved)).digest()})`;
    await adminClient!`INSERT INTO tenancy.quota_accounts (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end, included_quantity, safety_cap_quantity) VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution', now() - interval '1 minute', now() + interval '30 days', 100, 100)`;
    await adminClient!`INSERT INTO tenancy.flow_bots (id, tenant_id, name, status, default_language, created_by_membership_id) VALUES (${botId}::uuid, ${tenantId}::uuid, 'Public runtime bot', 'draft', 'en', ${membershipId}::uuid)`;
    await adminClient!`INSERT INTO tenancy.flow_versions (id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, published_by_membership_id) VALUES (${versionId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 1, 'published', ${adminClient!.json(snapshot)}, ${createHash("sha256").update(JSON.stringify(snapshot)).digest()}, ${membershipId}::uuid)`;
    await adminClient!`UPDATE tenancy.flow_bots SET status = 'active', current_published_version_id = ${versionId}::uuid WHERE tenant_id = ${tenantId}::uuid AND id = ${botId}::uuid`;
    await adminClient!`INSERT INTO tenancy.flow_deployments (id, tenant_id, bot_id, name, deployment_key_hash, key_prefix, traffic_status, live_version_id, live_at, allowed_origins, created_by_membership_id) VALUES (${deploymentId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 'Merchant site', ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 16)}, 'live', ${versionId}::uuid, now(), ARRAY['https://merchant.example'], ${membershipId}::uuid)`;
    const notificationKey = Buffer.alloc(32, 23);
    const notificationContext = createTenantContext({
      tenantId, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId,
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flowbot-notification-create",
    });
    const tenantNotificationStore = new TenantFlowbotNotificationStore(tenantClient!);
    const createdNotification = await tenantNotificationStore.create(notificationContext, {
      name: "Lead owner", recipientEmail: "owner@example.test", envelopeKey: notificationKey,
    });
    expect(createdNotification.status).toBe("created");
    if (createdNotification.status !== "created") throw new Error("Expected notification profile.");
    const notificationProfileId = createdNotification.profileId;
    await expect(tenantNotificationStore.list(notificationContext)).resolves.toEqual([
      expect.objectContaining({ id: notificationProfileId, name: "Lead owner", allowedTemplateKeys: ["flowbot.lead_captured"], status: "active" }),
    ]);
    const installCheckId = randomUUID();
    await adminClient!`
      INSERT INTO tenancy.flow_install_checks (id, tenant_id, deployment_id, requested_by_membership_id, target_origin, status)
      VALUES (${installCheckId}::uuid, ${tenantId}::uuid, ${deploymentId}::uuid, ${membershipId}::uuid, 'https://merchant.example', 'requested')
    `;

    const runtime = new FlowbotRuntimeStore(runtimeClient!);
    await expect(runtime.reportInstall(deploymentKey, "https://attacker.example")).resolves.toBe(0);
    await expect(runtime.reportInstall(deploymentKey, "https://merchant.example")).resolves.toBe(1);
    const installStatus = await adminClient!<{ status: string; safe_result_code: string }[]>`
      SELECT status, safe_result_code FROM tenancy.flow_install_checks WHERE id = ${installCheckId}::uuid
    `;
    expect(installStatus[0]).toEqual({ status: "verified", safe_result_code: "widget_seen" });
    await expect(runtime.config(deploymentKey, "https://attacker.example")).resolves.toBeNull();
    await expect(runtime.config(deploymentKey, "https://merchant.example")).resolves.toEqual({
      name: "Public runtime bot", defaultLanguage: "en", brandingRemoved: false,
    });
    await expect(runtimeClient!`SELECT count(*) FROM tenancy.contacts`).rejects.toThrow(/permission denied/);

    const started = await runtime.start({ deploymentKey, origin: "https://merchant.example", language: "en" });
    expect(started.sessionToken).toMatch(/^djay_flow_session_/);
    expect(started.response.messages.map((message) => message.type)).toEqual(["text", "form"]);
    const initialSync = await runtime.sync({
      deploymentKey, sessionToken: started.sessionToken,
      origin: "https://merchant.example", afterSequence: 0,
    });
    expect(initialSync).toMatchObject({ status: "active", lastMessageSequence: 2 });
    expect(initialSync?.messages.map((entry) => entry.message.type)).toEqual(["text", "form"]);
    await expect(runtime.sync({
      deploymentKey, sessionToken: started.sessionToken,
      origin: "https://attacker.example", afterSequence: 0,
    })).resolves.toBeNull();
    const replacementVersionId = randomUUID();
    const replacementSnapshot: FlowSnapshot = {
      ...snapshot, flowVersionId: replacementVersionId,
      nodes: { ...snapshot.nodes, [endId]: { id: endId, type: "end", title: "Done", message: { th: "เวอร์ชันใหม่", en: "New version" } } },
    };
    await adminClient!`
      INSERT INTO tenancy.flow_versions (id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, published_by_membership_id)
      VALUES (${replacementVersionId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 2, 'published',
        ${adminClient!.json(replacementSnapshot)}, ${createHash("sha256").update(JSON.stringify(replacementSnapshot)).digest()}, ${membershipId}::uuid)
    `;
    await adminClient!`UPDATE tenancy.flow_bots SET current_published_version_id = ${replacementVersionId}::uuid WHERE tenant_id = ${tenantId}::uuid AND id = ${botId}::uuid`;
    const pinnedDeployment = await adminClient!<{ flow_version_id: string }[]>`
      SELECT flow_version_id FROM tenancy.resolve_flowbot_deployment(${hashOpaqueToken(deploymentKey)})
    `;
    expect(pinnedDeployment[0]?.flow_version_id).toBe(versionId);
    const authoring = new FlowBotStore(tenantClient!);
    await expect(authoring.changeDeploymentTraffic(notificationContext, deploymentId, "go_live"))
      .resolves.toEqual({ status: "updated", trafficStatus: "live" });
    const repinnedDeployment = await adminClient!<{ flow_version_id: string }[]>`
      SELECT flow_version_id FROM tenancy.resolve_flowbot_deployment(${hashOpaqueToken(deploymentKey)})
    `;
    expect(repinnedDeployment[0]?.flow_version_id).toBe(replacementVersionId);
    const inputId = randomUUID();
    const completed = await runtime.advance({
      sessionToken: started.sessionToken,
      origin: "https://merchant.example",
      inputId,
      input: { type: "form", payload: { nodeId: formId, data: { name: "Narin", email: "narin@example.test" } } },
    });
    expect(completed).toMatchObject({ inputId, status: "completed", nextSequence: 3 });
    const replay = await runtime.advance({
      sessionToken: started.sessionToken,
      origin: "https://merchant.example",
      inputId,
      input: { type: "form", payload: { nodeId: formId, data: { name: "Changed", email: "changed@example.test" } } },
    });
    expect(replay).toEqual(completed);
    const notificationWorker = new FlowbotNotificationWorkerStore(workerClient!);
    const notification = await notificationWorker.claim(new Date(), new Date(Date.now() - 5 * 60 * 1000));
    expect(notification).toMatchObject({
      deliveryAllowed: true, attemptCount: 1,
      payload: { notificationProfileId, templateKey: "flowbot.lead_captured" },
    });
    expect(openJson<{ email: string }>(notification!.recipientCiphertext!, notificationKey)).toEqual({ email: "owner@example.test" });
    await notificationWorker.finish(notification!.id, true, null, false);
    await expect(notificationWorker.claim(new Date(), new Date(Date.now() - 5 * 60 * 1000))).resolves.toBeNull();
    const completedSync = await runtime.sync({
      deploymentKey, sessionToken: started.sessionToken,
      origin: "https://merchant.example", afterSequence: 2,
    });
    expect(completedSync).toMatchObject({ status: "completed", lastMessageSequence: 4 });
    expect(completedSync?.messages.map((entry) => entry.message.content.text)).toEqual(["Thank you"]);
    await expect(runtime.advance({
      sessionToken: started.sessionToken,
      origin: "https://attacker.example",
      inputId: randomUUID(),
      input: { type: "text", payload: { text: "hello" } },
    })).resolves.toBeNull();

    const facts = await adminClient!<{
      executions: number; messages: number; leads: number; identities: number;
      settled: number; reserved: string; settled_quantity: string; raw_sessions: number;
      ai_messages: number; notifications: number; fundingIncluded: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.flow_executions WHERE tenant_id = ${tenantId}::uuid AND deployment_id = ${deploymentId}::uuid) AS executions,
        (SELECT count(*)::int FROM tenancy.messages message JOIN tenancy.flow_executions execution ON execution.tenant_id = message.tenant_id AND execution.conversation_id = message.conversation_id WHERE execution.deployment_id = ${deploymentId}::uuid) AS messages,
        (SELECT count(*)::int FROM tenancy.leads WHERE tenant_id = ${tenantId}::uuid AND source = 'flowbot_web') AS leads,
        (SELECT count(*)::int FROM tenancy.contact_identities WHERE tenant_id = ${tenantId}::uuid AND normalized_value = 'narin@example.test') AS identities,
        (SELECT count(*)::int FROM tenancy.usage_reservations WHERE tenant_id = ${tenantId}::uuid AND idempotency_key LIKE 'flowbot:start:%' AND status = 'settled') AS settled,
        (SELECT (funding_json->>'included')::numeric::int FROM tenancy.usage_reservations
          WHERE tenant_id = ${tenantId}::uuid AND idempotency_key LIKE 'flowbot:start:%'
          ORDER BY created_at DESC LIMIT 1) AS "fundingIncluded",
        (SELECT reserved_quantity::text FROM tenancy.quota_accounts WHERE tenant_id = ${tenantId}::uuid AND subscription_id = ${subscriptionId}::uuid LIMIT 1) AS reserved,
        (SELECT settled_quantity::text FROM tenancy.quota_accounts WHERE tenant_id = ${tenantId}::uuid AND subscription_id = ${subscriptionId}::uuid LIMIT 1) AS settled_quantity,
        (SELECT count(*)::int FROM tenancy.flow_executions WHERE session_token_hash::text LIKE ${`%${started.sessionToken}%`}) AS raw_sessions,
        (SELECT count(*)::int FROM tenancy.messages message JOIN tenancy.flow_executions execution ON execution.tenant_id = message.tenant_id AND execution.conversation_id = message.conversation_id WHERE execution.deployment_id = ${deploymentId}::uuid AND message.actor_type = 'ai') AS ai_messages,
        (SELECT count(*)::int FROM tenancy.outbox WHERE tenant_id = ${tenantId}::uuid AND topic = 'flowbot.merchant_email.requested') AS notifications
    `;
    expect(facts[0]).toMatchObject({
      executions: 1, messages: 4, leads: 1, identities: 1, settled: 1,
      fundingIncluded: 1, reserved: "0.000000", settled_quantity: "1.000000",
      raw_sessions: 0, ai_messages: 0, notifications: 1,
    });

    const executionConversation = await adminClient!<{ conversation_id: string }[]>`
      SELECT conversation_id FROM tenancy.flow_executions
      WHERE tenant_id = ${tenantId}::uuid AND deployment_id = ${deploymentId}::uuid
    `;
    await adminClient!.begin(async (sql) => {
      const conversations = await sql<{ next_sequence: number }[]>`
        SELECT next_sequence FROM tenancy.conversations
        WHERE tenant_id = ${tenantId}::uuid AND id = ${executionConversation[0]!.conversation_id}::uuid
        FOR UPDATE
      `;
      await sql`
        UPDATE tenancy.conversations SET automation_mode = 'human', updated_at = now()
        WHERE tenant_id = ${tenantId}::uuid AND id = ${executionConversation[0]!.conversation_id}::uuid
      `;
      await sql`
        INSERT INTO tenancy.messages (tenant_id, conversation_id, sequence, actor_type, direction, content_json)
        VALUES (${tenantId}::uuid, ${executionConversation[0]!.conversation_id}::uuid,
          ${conversations[0]!.next_sequence}, 'human', 'outbound', '{"text":"A human reply"}'::jsonb)
      `;
      await sql`
        UPDATE tenancy.conversations SET next_sequence = next_sequence + 1
        WHERE tenant_id = ${tenantId}::uuid AND id = ${executionConversation[0]!.conversation_id}::uuid
      `;
    });
    const handoverSync = await runtime.sync({
      deploymentKey, sessionToken: started.sessionToken,
      origin: "https://merchant.example", afterSequence: 4,
    });
    expect(handoverSync).toMatchObject({ status: "handover", lastMessageSequence: 5 });
    expect(handoverSync?.messages[0]?.message).toMatchObject({ type: "text", content: { text: "A human reply" } });
    const analyticsStore = new FlowBotStore(tenantClient!);
    const analyticsContext = createTenantContext({
      tenantId, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId,
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flowbot-analytics",
    });
    const analytics = await analyticsStore.analytics(analyticsContext, 30);
    expect(analytics).toMatchObject({ level: "core", executions: 1, completed: 1, leads: 1 });
  });

  it("claims and completes an entitled Premium delay exactly once", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const membershipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
    const subscriptionId = randomUUID(); const snapshotId = randomUUID();
    const botId = randomUUID(); const versionId = randomUUID(); const deploymentId = randomUUID();
    const businessId = randomUUID(); const rootId = randomUUID(); const delayId = randomUUID(); const endId = randomUUID();
    const deploymentKey = `djay_flow_${Buffer.from(randomUUID()).toString("base64url")}`;
    const snapshot: FlowSnapshot = {
      schemaVersion: 1, flowVersionId: versionId, rootNodeId: businessId, keywords: [],
      nodes: {
        [businessId]: { id: businessId, type: "business_hours", title: "Open now", timezone: "UTC", scheduleKey: "always_open", openNodeId: rootId, closedNodeId: endId },
        [rootId]: { id: rootId, type: "message", title: "Start", content: { th: "รอสักครู่", en: "Please wait" }, nextNodeId: delayId },
        [delayId]: { id: delayId, type: "delay", title: "Delay", delaySeconds: 60, nextNodeId: endId },
        [endId]: { id: endId, type: "end", title: "Done", message: { th: "เรียบร้อย", en: "Completed" } },
      },
    };
    const resolved = {
      tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_premium",
      planVersionId: "62000000-0000-4000-8000-000000000002", accessMode: "active",
      entitlements: { "ai.enabled": false, "channel.web": true, "flow.nodes.core": true, "flow.nodes.advanced": true, "flow.delays": true, "flow.business_hours": true, "flow.webhook": "approved", "branding.remove": true },
      allowances: { flow_execution: 100 }, overageRatesMinor: { flow_execution: null },
      limits: { active_bots: 3, flow_nodes_per_bot: 500, deployments: 5 }, resolvedAt: new Date().toISOString(),
    };
    await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now() WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'`;
    await adminClient!`INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status, period_start, period_end) VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', '62000000-0000-4000-8000-000000000002', 'active', now(), now() + interval '30 days')`;
    await adminClient!`INSERT INTO tenancy.entitlement_snapshots (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status, access_mode, resolved_json, resolution_hash) VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', '62000000-0000-4000-8000-000000000002', 'active', 'active', ${adminClient!.json(resolved)}, ${createHash("sha256").update(JSON.stringify(resolved)).digest()})`;
    await adminClient!`INSERT INTO tenancy.quota_accounts (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end, included_quantity, safety_cap_quantity) VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution', now() - interval '1 minute', now() + interval '30 days', 100, 100)`;
    await adminClient!`INSERT INTO tenancy.flow_bots (id, tenant_id, name, status, default_language, branding_removed, created_by_membership_id) VALUES (${botId}::uuid, ${tenantId}::uuid, 'Premium timer bot', 'draft', 'en', true, ${membershipId}::uuid)`;
    await adminClient!`
      INSERT INTO tenancy.flow_business_schedules (tenant_id, schedule_key, name, timezone, weekly_windows, created_by_membership_id)
      VALUES (${tenantId}::uuid, 'always_open', 'Always open', 'UTC',
        ${adminClient!.json(Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, startMinute: 0, endMinute: 1440 })))},
        ${membershipId}::uuid)
    `;
    await adminClient!`INSERT INTO tenancy.flow_versions (id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, published_by_membership_id) VALUES (${versionId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 1, 'published', ${adminClient!.json(snapshot)}, ${createHash("sha256").update(JSON.stringify(snapshot)).digest()}, ${membershipId}::uuid)`;
    await adminClient!`UPDATE tenancy.flow_bots SET status = 'active', current_published_version_id = ${versionId}::uuid WHERE tenant_id = ${tenantId}::uuid AND id = ${botId}::uuid`;
    await adminClient!`INSERT INTO tenancy.flow_deployments (id, tenant_id, bot_id, name, deployment_key_hash, key_prefix, traffic_status, live_version_id, live_at, allowed_origins, created_by_membership_id) VALUES (${deploymentId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 'Premium site', ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 16)}, 'live', ${versionId}::uuid, now(), ARRAY['https://premium.example'], ${membershipId}::uuid)`;

    const runtime = new FlowbotRuntimeStore(runtimeClient!);
    const started = await runtime.start({ deploymentKey, origin: "https://premium.example", language: "en" });
    expect(started.response).toMatchObject({ status: "waiting", nextSequence: 2 });
    expect(started.response.messages.map((message) => message.content.text)).toEqual(["Please wait"]);
    await adminClient!`UPDATE tenancy.flow_timers SET due_at = now() - interval '1 second' WHERE tenant_id = ${tenantId}::uuid AND execution_id IN (SELECT id FROM tenancy.flow_executions WHERE deployment_id = ${deploymentId}::uuid)`;
    const worker = new FlowbotWorkerStore(workerClient!);
    const fired = await worker.processNextTimer();
    expect(fired.status).toBe("fired");
    await expect(worker.processNextTimer()).resolves.toEqual({ status: "idle" });
    const state = await adminClient!<{ status: string; timer_status: string; completed_messages: number }[]>`
      SELECT execution.status, timer.status AS timer_status,
        (SELECT count(*)::int FROM tenancy.messages message WHERE message.tenant_id = execution.tenant_id AND message.conversation_id = execution.conversation_id AND message.content_json->'content'->>'text' = 'Completed') AS completed_messages
      FROM tenancy.flow_executions execution
      JOIN tenancy.flow_timers timer ON timer.tenant_id = execution.tenant_id AND timer.execution_id = execution.id
      WHERE execution.deployment_id = ${deploymentId}::uuid
    `;
    expect(state[0]).toEqual({ status: "completed", timer_status: "fired", completed_messages: 1 });
  });

  it("requires platform approval before an encrypted integration dispatch can be claimed", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const envelopeKey = Buffer.alloc(32, 19);
    const tenantContext = createTenantContext({
      tenantId, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flowbot-integration-request",
    });
    const tenantBContext = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flowbot-integration-isolation",
    });
    const integrationTenantClient = createDatabaseClient(process.env.TENANT_DATABASE_URL!);
    const tenantStore = new TenantFlowbotIntegrationStore(integrationTenantClient);
    const requested = await tenantStore.request(tenantContext, {
      name: "Qualified lead webhook", endpoint: "https://hooks.example.com/flowbot",
      allowedTemplateKeys: ["lead.qualified"], envelopeKey,
    });
    expect(requested.status).toBe("requested"); if (requested.status !== "requested") throw new Error("Expected integration request.");
    const own = await tenantStore.list(tenantContext);
    expect(openJson<{ url: string }>(own[0]!.endpointCiphertext, envelopeKey).url).toBe("https://hooks.example.com/flowbot");
    await expect(tenantStore.list(tenantBContext)).resolves.toEqual([]);

    const owners = await adminClient!<{ id: string }[]>`SELECT id FROM platform.users WHERE status = 'active' ORDER BY created_at LIMIT 1`;
    const platformContext = createPlatformContext({ platformUserId: owners[0]!.id, sessionId: randomUUID(), role: "platform_owner", requestId: "flowbot-integration-approve", reauthenticatedAt: new Date() });
    const integrationPlatformClient = createDatabaseClient(process.env.PLATFORM_DATABASE_URL!);
    const platformStore = new PlatformFlowbotIntegrationStore(integrationPlatformClient);
    await expect(platformStore.approve(platformContext, requested.integrationId)).resolves.toEqual({ status: "approved" });
    const botId = randomUUID(); const versionId = randomUUID(); const deploymentId = randomUUID();
    const webhookId = randomUUID(); const successId = randomUUID(); const failureId = randomUUID();
    const deploymentKey = `djay_flow_${Buffer.from(randomUUID()).toString("base64url")}`;
    const snapshot: FlowSnapshot = {
      schemaVersion: 1, flowVersionId: versionId, rootNodeId: webhookId, keywords: [],
      nodes: {
        [webhookId]: { id: webhookId, type: "webhook", title: "Notify", integrationProfileId: requested.integrationId, templateKey: "lead.qualified", nextNodeId: successId, failureNodeId: failureId },
        [successId]: { id: successId, type: "end", title: "Delivered", message: { th: "ส่งแล้ว", en: "Delivered" } },
        [failureId]: { id: failureId, type: "end", title: "Failed", message: { th: "ส่งไม่สำเร็จ", en: "Delivery failed" } },
      },
    };
    await adminClient!`INSERT INTO tenancy.flow_bots (id, tenant_id, name, status, default_language, created_by_membership_id) VALUES (${botId}::uuid, ${tenantId}::uuid, 'Premium webhook bot', 'draft', 'en', ${tenantContext.membershipId}::uuid)`;
    await adminClient!`INSERT INTO tenancy.flow_versions (id, tenant_id, bot_id, version, status, snapshot_json, snapshot_sha256, published_by_membership_id) VALUES (${versionId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 1, 'published', ${adminClient!.json(snapshot)}, ${createHash("sha256").update(JSON.stringify(snapshot)).digest()}, ${tenantContext.membershipId}::uuid)`;
    await adminClient!`UPDATE tenancy.flow_bots SET status = 'active', current_published_version_id = ${versionId}::uuid WHERE tenant_id = ${tenantId}::uuid AND id = ${botId}::uuid`;
    await adminClient!`INSERT INTO tenancy.flow_deployments (id, tenant_id, bot_id, name, deployment_key_hash, key_prefix, traffic_status, live_version_id, live_at, allowed_origins, created_by_membership_id) VALUES (${deploymentId}::uuid, ${tenantId}::uuid, ${botId}::uuid, 'Webhook site', ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 16)}, 'live', ${versionId}::uuid, now(), ARRAY['https://webhook.example'], ${tenantContext.membershipId}::uuid)`;

    const runtime = new FlowbotRuntimeStore(runtimeClient!, envelopeKey);
    const started = await runtime.start({ deploymentKey, origin: "https://webhook.example", language: "en" });
    expect(started.response.status).toBe("waiting");
    const dispatches = await adminClient!<{ id: string }[]>`SELECT id FROM tenancy.flow_integration_dispatches WHERE tenant_id = ${tenantId}::uuid AND execution_id IN (SELECT id FROM tenancy.flow_executions WHERE deployment_id = ${deploymentId}::uuid) ORDER BY created_at`;
    const dispatchId = dispatches[0]!.id;
    const worker = new FlowbotWorkerStore(workerClient!);
    const claimed = await worker.claimNextDispatch();
    expect(claimed).toMatchObject({ dispatchId, templateKey: "lead.qualified", attemptCount: 1 });
    expect(openJson<{ integrationProfileId: string }>(claimed!.payloadCiphertext, envelopeKey).integrationProfileId).toBe(requested.integrationId);
    await expect(worker.completeDispatch(claimed!, true)).resolves.toEqual({ status: "succeeded", executionStatus: "completed" });
    const delivered = await adminClient!<{ status: string; execution_status: string; delivered_messages: number }[]>`
      SELECT dispatch.status, execution.status AS execution_status,
        (SELECT count(*)::int FROM tenancy.messages message WHERE message.tenant_id = execution.tenant_id AND message.conversation_id = execution.conversation_id AND message.content_json->'content'->>'text' = 'Delivered') AS delivered_messages
      FROM tenancy.flow_integration_dispatches dispatch
      JOIN tenancy.flow_executions execution ON execution.tenant_id = dispatch.tenant_id AND execution.id = dispatch.execution_id
      WHERE dispatch.id = ${dispatchId}::uuid
    `;
    expect(delivered[0]).toEqual({ status: "succeeded", execution_status: "completed", delivered_messages: 1 });

    const failedStart = await runtime.start({ deploymentKey, origin: "https://webhook.example", language: "en" });
    expect(failedStart.response.status).toBe("waiting");
    const failedDispatch = await adminClient!<{ id: string }[]>`SELECT id FROM tenancy.flow_integration_dispatches WHERE tenant_id = ${tenantId}::uuid AND status = 'requested' ORDER BY created_at DESC LIMIT 1`;
    await adminClient!`UPDATE tenancy.flow_integration_dispatches SET attempt_count = 9 WHERE id = ${failedDispatch[0]!.id}::uuid`;
    const exhausted = await worker.claimNextDispatch();
    expect(exhausted).toMatchObject({ dispatchId: failedDispatch[0]!.id, attemptCount: 10 });
    await expect(worker.completeDispatch(exhausted!, false, "integration_http_rejected")).resolves.toEqual({ status: "dead_letter", executionStatus: "completed" });
    const failed = await adminClient!<{ status: string; safe_error_code: string; failed_messages: number }[]>`
      SELECT dispatch.status, dispatch.safe_error_code,
        (SELECT count(*)::int FROM tenancy.messages message WHERE message.tenant_id = execution.tenant_id AND message.conversation_id = execution.conversation_id AND message.content_json->'content'->>'text' = 'Delivery failed') AS failed_messages
      FROM tenancy.flow_integration_dispatches dispatch
      JOIN tenancy.flow_executions execution ON execution.tenant_id = dispatch.tenant_id AND execution.id = dispatch.execution_id
      WHERE dispatch.id = ${failedDispatch[0]!.id}::uuid
    `;
    expect(failed[0]).toEqual({ status: "dead_letter", safe_error_code: "integration_http_rejected", failed_messages: 1 });
    await integrationTenantClient.end();
    await integrationPlatformClient.end();
  });
});
