import { randomUUID } from "node:crypto";
import { keyedRequestHash, openJson, sealJson } from "@djay/auth";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabaseClient, type DatabaseClient } from "./client";
import { FlowBotStore } from "./flowbot-store";
import { FlowSocialConnectionStore, FlowSocialRuntimeStore, FlowSocialWorkerStore } from "./flowbot-social-store";

const enabled = Boolean(process.env.TENANT_DATABASE_URL && process.env.FLOWBOT_DATABASE_URL && process.env.WORKER_DATABASE_URL && process.env.ADMIN_DATABASE_URL);
const envelopeKey = Buffer.alloc(32, 81); const subjectKey = Buffer.alloc(32, 82);
let tenantClient: DatabaseClient | null = null; let runtimeClient: DatabaseClient | null = null; let workerClient: DatabaseClient | null = null; let adminClient: DatabaseClient | null = null;

async function provisionCurrentAdvancedAuthority(tenantId: string) {
  const subscriptionId = randomUUID();
  const snapshotId = randomUUID();
  const planVersionId = "62000000-0000-4000-8000-000000000102";
  const resolved = {
    tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_premium", planVersionId,
    accessMode: "active",
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
    limits: { active_bots: 3, workspaces: 1, topics: 500, seats: 3, social_channels: 1 },
    resolvedAt: new Date().toISOString(),
  };
  await adminClient!`
    UPDATE tenancy.product_subscriptions
    SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'
  `;
  await adminClient!`
    INSERT INTO tenancy.product_subscriptions
      (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${planVersionId}::uuid,
      'active', now(), now() + interval '1 year')
  `;
  await adminClient!`
    INSERT INTO tenancy.entitlement_snapshots
      (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
       access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot',
      ${planVersionId}::uuid, 'active', 'active', ${adminClient!.json(resolved)}, digest(${snapshotId}, 'sha256'))
  `;
  await adminClient!`
    INSERT INTO tenancy.quota_accounts
      (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
       included_quantity, safety_cap_quantity)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution',
      now() - interval '1 minute', now() + interval '1 year', 100000, 100000)
  `;
}

async function provisionBasicWithSocialAddOn(tenantId: string, options: { withAddOn: boolean }) {
  const subscriptionId = randomUUID();
  const snapshotId = randomUUID();
  const planVersionId = "62000000-0000-4000-8000-000000000101"; // flowbot_basic
  const resolved = {
    tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: "flowbot_basic", planVersionId,
    accessMode: "active",
    entitlements: {
      "channel.web": true, "channel.social": false, "ai.enabled": false,
      "flow.nodes.core": true, "flow.nodes.advanced": false, "flow.forms": true,
      "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
      "flow.team_routing": "limited", "flow.webhook": false, "branding.remove": false,
      "analytics.level": "basic", "support.level": "standard",
    },
    allowances: { flow_execution: 100_000 }, overageRatesMinor: { flow_execution: null },
    limits: { active_bots: 1, workspaces: 1, topics: 150, seats: 1, social_channels: 0 },
    resolvedAt: new Date().toISOString(),
  };
  await adminClient!`
    UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'
  `;
  await adminClient!`
    INSERT INTO tenancy.product_subscriptions
      (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
    VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${planVersionId}::uuid,
      'active', now(), now() + interval '1 year')
  `;
  await adminClient!`
    INSERT INTO tenancy.entitlement_snapshots
      (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
       access_mode, resolved_json, resolution_hash)
    VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot',
      ${planVersionId}::uuid, 'active', 'active', ${adminClient!.json(resolved)}, digest(${snapshotId}, 'sha256'))
  `;
  await adminClient!`
    INSERT INTO tenancy.quota_accounts
      (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
       included_quantity, safety_cap_quantity)
    VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution',
      now() - interval '1 minute', now() + interval '1 year', 100000, 100000)
  `;
  if (options.withAddOn) {
    await adminClient!`
      INSERT INTO tenancy.subscription_add_ons
        (tenant_id, subscription_id, add_on_key, quantity, status, effective_from)
      VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'additional_social_channel', 1, 'active', now() - interval '1 minute')
    `;
  }
}

beforeAll(() => {
  if (!enabled) return;
  tenantClient = createDatabaseClient(process.env.TENANT_DATABASE_URL!);
  runtimeClient = createDatabaseClient(process.env.FLOWBOT_DATABASE_URL!);
  workerClient = createDatabaseClient(process.env.WORKER_DATABASE_URL!);
  adminClient = createDatabaseClient(process.env.ADMIN_DATABASE_URL!);
});
afterAll(async () => { await Promise.all([tenantClient?.end(), runtimeClient?.end(), workerClient?.end(), adminClient?.end()]); });

describe.runIf(enabled)("FlowBot Premium deterministic social runtime", () => {
  it("deduplicates LINE input, executes the immutable Flow graph, and queues resumable delivery", async () => {
    const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: `flow-social-${randomUUID()}` });
    await provisionCurrentAdvancedAuthority(context.tenantId);
    await adminClient!`
      UPDATE tenancy.flow_bots
      SET status = 'archived', updated_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'
    `;
    const flow = new FlowBotStore(tenantClient!);
    const created = await flow.createBot(context, { name: "LINE deterministic assistant", defaultLanguage: "en" });
    expect(created.status).toBe("created"); if (created.status !== "created") throw new Error("Expected Flow bot.");
    const draft = await flow.getDraft(context, created.botId); const root = randomUUID(); const end = randomUUID(); const option = randomUUID();
    await expect(flow.updateDraft(context, created.botId, { revision: draft!.revision, definition: {
      schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
        [root]: { id: root, type: "options", title: "Department", prompt: { th: "เลือกทีม", en: "Choose a team" },
          options: [{ id: option, label: { th: "ฝ่ายขาย", en: "Sales" }, targetNodeId: end }] },
        [end]: { id: end, type: "end", title: "Done", message: { th: "ฝ่ายขายจะติดต่อกลับ", en: "Sales will follow up." } },
      },
    } })).resolves.toMatchObject({ status: "updated" });
    await expect(flow.publish(context, created.botId)).resolves.toMatchObject({ status: "published" });

    const connections = new FlowSocialConnectionStore(tenantClient!);
    const connected = await connections.create(context, { botId: created.botId, channel: "line", name: "Main LINE OA",
      externalAccountRef: `line-${randomUUID()}`, credentials: { channel: "line", channelAccessToken: "line-access-token-value", channelSecret: "line-channel-secret-value" }, envelopeKey });
    expect(connected.status).toBe("created"); if (connected.status !== "created") throw new Error("Expected social connection.");
    const runtime = new FlowSocialRuntimeStore(runtimeClient!, envelopeKey);
    await expect(runtime.connection(connected.webhookKey, "line")).resolves.toMatchObject({ connectionId: connected.connectionId, channel: "line" });
    const externalSubject = "LINE-U-123";
    const subjectHash = keyedRequestHash(subjectKey, { connectionId: connected.connectionId, externalSubject });
    const event = { webhookKey: connected.webhookKey, channel: "line" as const, externalEventId: `line-${randomUUID()}`,
      externalMessageId: `message-${randomUUID()}`, subjectHash, eventType: "inbound.message" as const,
      occurredAt: new Date(), normalized: { text: "Sales", subjectCiphertext: sealJson({ value: externalSubject }, envelopeKey),
        replyTokenCiphertext: sealJson({ value: "line-reply-token" }, envelopeKey), deliveryStatus: null } };
    const received = await runtime.receive(event);
    expect(received).toMatchObject({ disposition: "accepted", replayed: false });
    await expect(runtime.receive(event)).resolves.toMatchObject({ receiptId: received?.receiptId, replayed: true });

    const worker = new FlowSocialWorkerStore(workerClient!); const claim = await worker.claim();
    expect(claim).toMatchObject({ receipt_id: received?.receiptId, channel: "line", event_type: "inbound.message", processing_allowed: true });
    if (!claim) throw new Error("Expected inbound claim.");
    await expect(worker.processInbound(claim)).resolves.toMatchObject({ status: "processed", messageCount: 2 });
    const delivery = await worker.claimDelivery();
    expect(delivery).toMatchObject({ channel: "line", delivered_part_count: 0, delivery_allowed: true,
      response_json: { status: "completed", messages: [{ type: "options" }, { type: "text" }] } });
    if (!delivery) throw new Error("Expected delivery claim.");
    expect(openJson<{ value: string }>(delivery.recipient_ciphertext, envelopeKey).value).toBe(externalSubject);
    expect(openJson<{ value: string }>(delivery.reply_token_ciphertext!, envelopeKey).value).toBe("line-reply-token");
    await expect(worker.finishDelivery({ deliveryId: delivery.delivery_id, delivered: true,
      externalMessageIds: ["line-outbound-1"], completedPartCount: 1, safeErrorCode: null })).resolves.toBe(true);
    const own = await connections.list(context);
    expect(own).toContainEqual(expect.objectContaining({ id: connected.connectionId, channel: "line", status: "active" }));
  });

  it("authorizes a Basic tenant holding an active additional_social_channel add-on", async () => {
    const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb20",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb21",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: `flow-social-basic-${randomUUID()}` });
    await provisionBasicWithSocialAddOn(context.tenantId, { withAddOn: true });
    await adminClient!`UPDATE tenancy.flow_bots SET status = 'archived', updated_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'`;
    const flow = new FlowBotStore(tenantClient!);
    const created = await flow.createBot(context, { name: "Basic LINE assistant", defaultLanguage: "en" });
    if (created.status !== "created") throw new Error("Expected Flow bot.");
    const draft = await flow.getDraft(context, created.botId); const root = randomUUID(); const end = randomUUID(); const option = randomUUID();
    await flow.updateDraft(context, created.botId, { revision: draft!.revision, definition: {
      schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
        [root]: { id: root, type: "options", title: "Department", prompt: { th: "เลือกทีม", en: "Choose a team" },
          options: [{ id: option, label: { th: "ฝ่ายขาย", en: "Sales" }, targetNodeId: end }] },
        [end]: { id: end, type: "end", title: "Done", message: { th: "ทีมงานจะติดต่อกลับ", en: "The team will follow up." } },
      } } });
    await flow.publish(context, created.botId);
    const connections = new FlowSocialConnectionStore(tenantClient!);
    const connected = await connections.create(context, { botId: created.botId, channel: "line", name: "Basic LINE OA",
      externalAccountRef: `line-${randomUUID()}`,
      credentials: { channel: "line", channelAccessToken: "line-access-token-value", channelSecret: "line-channel-secret-value" }, envelopeKey });
    expect(connected.status).toBe("created");
  });

  it("rejects a Basic tenant with no social add-on", async () => {
    const context = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb30",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb3", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb31",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: `flow-social-basic-none-${randomUUID()}` });
    await provisionBasicWithSocialAddOn(context.tenantId, { withAddOn: false });
    await adminClient!`UPDATE tenancy.flow_bots SET status = 'archived', updated_at = now()
      WHERE tenant_id = ${context.tenantId}::uuid AND status <> 'archived'`;
    const flow = new FlowBotStore(tenantClient!);
    const created = await flow.createBot(context, { name: "Basic no-addon", defaultLanguage: "en" });
    if (created.status !== "created") throw new Error("Expected Flow bot.");
    const draft = await flow.getDraft(context, created.botId); const root = randomUUID(); const end = randomUUID();
    await flow.updateDraft(context, created.botId, { revision: draft!.revision, definition: {
      schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
        [root]: { id: root, type: "end", title: "Done", message: { th: "ปิด", en: "Closed" } },
      } } });
    await flow.publish(context, created.botId);
    const connections = new FlowSocialConnectionStore(tenantClient!);
    const rejected = await connections.create(context, { botId: created.botId, channel: "line", name: "Blocked LINE OA",
      externalAccountRef: `line-${randomUUID()}`,
      credentials: { channel: "line", channelAccessToken: "line-access-token-value", channelSecret: "line-channel-secret-value" }, envelopeKey });
    expect(rejected.status).toBe("not_entitled");
  });
});
