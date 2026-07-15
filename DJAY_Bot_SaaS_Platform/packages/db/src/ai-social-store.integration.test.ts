import { randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { AiChatStore } from "./ai-chat-store";
import { AiSocialConnectionStore, AiSocialRuntimeStore, AiSocialWorkerStore } from "./ai-social-store";
import { createDatabaseClient } from "./client";

const runtimeUrl = process.env.AI_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(runtimeUrl && tenantUrl && adminUrl && workerUrl);
const runtimeClient = enabled ? createDatabaseClient(runtimeUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;

afterAll(async () => {
  await runtimeClient?.end(); await tenantClient?.end(); await adminClient?.end(); await workerClient?.end();
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
    await expect(connections.runtimeCredentials(otherContext, created.connectionId, envelopeKey)).resolves.toBeNull();
    await expect(connections.recordHealth(context, {
      connectionId: created.connectionId, healthy: false,
      reauthorizationRequired: true, safeErrorCode: "credential_reauthorization_required",
    })).resolves.toMatchObject({ status: "checked", connectionStatus: "reauthorization_required", healthStatus: "failed" });
    await expect(runtime.connection(created.webhookKey, "line")).resolves.toBeNull();
    await expect(connections.rotateLine(context, {
      connectionId: created.connectionId, envelopeKey,
      credentials: {
        channel: "line", channelAccessToken: "rotated-line-access-token",
        channelSecret: "rotated-line-secret-value",
      },
    })).resolves.toEqual({ status: "rotated", credentialKeyVersion: 2 });
    await expect(connections.runtimeCredentials(context, created.connectionId, envelopeKey)).resolves.toMatchObject({
      channel: "line", credentialKeyVersion: 2,
      credentials: { channelAccessToken: "rotated-line-access-token" },
    });
    await expect(connections.recordHealth(context, {
      connectionId: created.connectionId, healthy: true,
      reauthorizationRequired: false, safeErrorCode: null,
    })).resolves.toMatchObject({ status: "checked", connectionStatus: "active", healthStatus: "healthy" });
    await expect(connections.list(context)).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: created.connectionId, status: "active", healthStatus: "healthy" }),
    ]));

    const occurredAt = new Date();
    const subjectHash = Buffer.alloc(32, 23);
    const subjectCiphertext = sealJson({ value: "line-user-123" }, envelopeKey);
    const replyTokenCiphertext = sealJson({ value: "opaque-reply" }, envelopeKey);
    const accepted = await runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-1",
      externalMessageId: "line-message-1", subjectHash, eventType: "inbound.message",
      occurredAt, normalized: { text: "Hello", subjectCiphertext, replyTokenCiphertext, deliveryStatus: null },
    });
    expect(accepted).toMatchObject({ disposition: "accepted", replayed: false });
    await expect(runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-1",
      externalMessageId: "line-message-1", subjectHash, eventType: "inbound.message",
      occurredAt, normalized: { text: "Changed replay", subjectCiphertext, replyTokenCiphertext: null, deliveryStatus: null },
    })).resolves.toEqual(accepted && { ...accepted, replayed: true });
    await expect(runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-old",
      externalMessageId: "line-message-old", subjectHash, eventType: "inbound.message",
      occurredAt: new Date(occurredAt.getTime() - 60_000),
      normalized: { text: "Older", subjectCiphertext, replyTokenCiphertext: null, deliveryStatus: null },
    })).resolves.toMatchObject({ disposition: "out_of_order", replayed: false });

    const worker = new AiSocialWorkerStore(workerClient!, envelopeKey);
    const claimed = await worker.claim();
    expect(claimed).toMatchObject({
      receiptId: accepted?.receiptId, channel: "line", eventType: "inbound.message",
      externalSubject: "line-user-123", replyToken: "opaque-reply", text: "Hello",
      processingAllowed: true, attemptCount: 1,
      credentials: { channel: "line", channelAccessToken: "rotated-line-access-token" },
    });
    if (!claimed) throw new Error("Expected social inbound claim.");
    await worker.finish(claimed.outboxId, false, "gateway_unavailable");
    const retried = await worker.claim(new Date(Date.now() + 60_000));
    expect(retried).toMatchObject({ outboxId: claimed.outboxId, attemptCount: 2, processingAllowed: true });
    if (!retried) throw new Error("Expected social inbound retry.");
    await worker.finish(retried.outboxId, true, null);
    await expect(worker.claim(new Date(Date.now() + 120_000))).resolves.toBeNull();
    await runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-dead-letter",
      externalMessageId: "line-message-dead-letter", subjectHash, eventType: "inbound.message",
      occurredAt: new Date(occurredAt.getTime() + 1_000),
      normalized: { text: "Dead letter proof", subjectCiphertext, replyTokenCiphertext: null, deliveryStatus: null },
    });
    const deadLetterClaim = await worker.claim();
    if (!deadLetterClaim) throw new Error("Expected social inbound dead-letter claim.");
    await worker.finish(deadLetterClaim.outboxId, false, "structured_output_invalid", true);
    await expect(adminClient!<{ status: string; error: string }[]>`
      SELECT status, last_error_code AS error FROM tenancy.outbox WHERE id = ${deadLetterClaim.outboxId}::uuid
    `).resolves.toEqual([{ status: "dead_letter", error: "structured_output_invalid" }]);

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
    expect(evidence[0]).toEqual({ receipts: 3, accepted: 2, out_of_order: 1, jobs: 2, credential_plaintext: false });

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
