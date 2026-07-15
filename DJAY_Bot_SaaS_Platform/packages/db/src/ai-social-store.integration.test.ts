import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { AiChatStore } from "./ai-chat-store";
import { AiSocialConnectionStore, AiSocialRuntimeStore } from "./ai-social-store";
import { createDatabaseClient } from "./client";

const runtimeUrl = process.env.AI_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(runtimeUrl && tenantUrl && adminUrl);
const runtimeClient = enabled ? createDatabaseClient(runtimeUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await runtimeClient?.end(); await tenantClient?.end(); await adminClient?.end();
});

describe.runIf(enabled)("P6 LINE connection and webhook receipt repositories", () => {
  it("enforces Premium, tenant isolation, opaque secrets, replay, ordering, and revocation", async () => {
    const tenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10";
    const context = createTenantContext({
      tenantId,
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "p6-line-premium",
    });
    const otherContext = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "p6-line-wrong-tenant",
    });
    const premiumSubscriptionId = randomUUID();
    const premiumSnapshotId = randomUUID();
    const premiumPlanVersionId = "62000000-0000-4000-8000-000000000004";
    const premiumEntitlements = {
      "ai.enabled": true, "sales_core.enabled": true, "knowledge.enabled": true,
      "ai.text": true, "channel.web": true, "channel.line": true,
      "channel.whatsapp": true, "channel.messenger": true,
    };
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND product_key = 'ai_chat' AND status <> 'cancelled'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status, period_start, period_end
      ) VALUES (
        ${premiumSubscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${premiumPlanVersionId}::uuid,
        'active', now(), now() + interval '30 days'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${premiumSnapshotId}::uuid, ${tenantId}::uuid, ${premiumSubscriptionId}::uuid,
        'ai_chat', ${premiumPlanVersionId}::uuid, 'active', 'active',
        ${adminClient!.json({
          tenantId, subscriptionId: premiumSubscriptionId, productKey: "ai_chat",
          publicPlanKey: "ai_chat_premium", planVersionId: premiumPlanVersionId,
          accessMode: "active", entitlements: premiumEntitlements,
          allowances: { ai_response: 100 }, overageRatesMinor: { ai_response: null },
          limits: { deployments: 5 }, resolvedAt: new Date().toISOString(),
        })}, digest(${premiumSnapshotId}, 'sha256')
      )
    `;

    const authoring = new AiChatStore(tenantClient!);
    const agent = await authoring.createAgent(context, {
      name: "Mali Social", businessName: "Tenant B", defaultLanguage: "en",
    });
    expect(agent.status).toBe("created");
    if (agent.status !== "created") throw new Error("Expected social AI agent.");
    await expect(authoring.publish(context, agent.agentId)).resolves.toMatchObject({ status: "published" });

    const envelopeKey = Buffer.alloc(32, 19);
    const connections = new AiSocialConnectionStore(tenantClient!);
    const created = await connections.createLine(context, {
      agentId: agent.agentId, name: "Main LINE", externalAccountRef: "line-account-tenant-b",
      credentials: {
        channel: "line", channelAccessToken: "line-access-token-value", channelSecret: "line-secret-value-123",
      },
      envelopeKey,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") throw new Error("Expected LINE connection.");
    expect(JSON.stringify(await connections.list(context))).not.toMatch(/line-access-token|line-secret-value|webhookKey/i);
    await expect(connections.revoke(otherContext, created.connectionId)).resolves.toEqual({ status: "not_found" });

    const runtime = new AiSocialRuntimeStore(runtimeClient!, envelopeKey);
    const resolved = await runtime.connection(created.webhookKey, "line");
    expect(resolved).toMatchObject({ connectionId: created.connectionId, channel: "line" });
    expect(resolved?.credentials).toMatchObject({ channel: "line", channelSecret: "line-secret-value-123" });

    const occurredAt = new Date();
    const subjectHash = Buffer.alloc(32, 23);
    const accepted = await runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-1",
      externalMessageId: "line-message-1", subjectHash, eventType: "inbound.message",
      occurredAt, normalized: { text: "Hello", replyToken: "opaque-reply", deliveryStatus: null },
    });
    expect(accepted).toMatchObject({ disposition: "accepted", replayed: false });
    await expect(runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-1",
      externalMessageId: "line-message-1", subjectHash, eventType: "inbound.message",
      occurredAt, normalized: { text: "Changed replay", replyToken: null, deliveryStatus: null },
    })).resolves.toEqual(accepted && { ...accepted, replayed: true });
    await expect(runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-old",
      externalMessageId: "line-message-old", subjectHash, eventType: "inbound.message",
      occurredAt: new Date(occurredAt.getTime() - 60_000),
      normalized: { text: "Older", replyToken: null, deliveryStatus: null },
    })).resolves.toMatchObject({ disposition: "out_of_order", replayed: false });

    const evidence = await adminClient!<{
      receipts: number; accepted: number; out_of_order: number; jobs: number; credential_plaintext: boolean;
    }[]>`
      SELECT
        count(*)::int AS receipts,
        count(*) FILTER (WHERE disposition = 'accepted')::int AS accepted,
        count(*) FILTER (WHERE disposition = 'out_of_order')::int AS out_of_order,
        (SELECT count(*)::int FROM tenancy.outbox item WHERE item.tenant_id = receipt.tenant_id
          AND item.topic = 'ai_chat.social.inbound.received') AS jobs,
        bool_or(connection.credential_ciphertext LIKE '%line-secret-value%') AS credential_plaintext
      FROM tenancy.ai_social_inbound_receipts receipt
      JOIN tenancy.ai_social_connections connection
        ON connection.tenant_id = receipt.tenant_id AND connection.id = receipt.connection_id
      WHERE receipt.tenant_id = ${tenantId}::uuid
      GROUP BY receipt.tenant_id
    `;
    expect(evidence[0]).toEqual({ receipts: 2, accepted: 1, out_of_order: 1, jobs: 1, credential_plaintext: false });

    await expect(connections.revoke(context, created.connectionId)).resolves.toEqual({ status: "revoked" });
    await expect(runtime.connection(created.webhookKey, "line")).resolves.toBeNull();

    const basicSubscriptionId = randomUUID(); const basicSnapshotId = randomUUID();
    const basicPlanVersionId = "62000000-0000-4000-8000-000000000003";
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE id = ${premiumSubscriptionId}::uuid
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status, period_start, period_end
      ) VALUES (
        ${basicSubscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${basicPlanVersionId}::uuid,
        'active', now(), now() + interval '30 days'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${basicSnapshotId}::uuid, ${tenantId}::uuid, ${basicSubscriptionId}::uuid,
        'ai_chat', ${basicPlanVersionId}::uuid, 'active', 'active',
        ${adminClient!.json({
          tenantId, subscriptionId: basicSubscriptionId, productKey: "ai_chat",
          publicPlanKey: "ai_chat_basic", planVersionId: basicPlanVersionId,
          accessMode: "active", entitlements: { ...premiumEntitlements, "channel.line": false },
          allowances: {}, overageRatesMinor: {}, limits: { deployments: 5 }, resolvedAt: new Date().toISOString(),
        })}, digest(${basicSnapshotId}, 'sha256')
      )
    `;
    await expect(connections.createLine(context, {
      agentId: agent.agentId, name: "Denied LINE", externalAccountRef: "line-account-basic",
      credentials: { channel: "line" }, envelopeKey,
    })).resolves.toEqual({ status: "not_entitled" });
  });
});
