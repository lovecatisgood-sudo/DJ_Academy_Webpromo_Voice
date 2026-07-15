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
      "lead_capture.enabled": true, "appointment_request.enabled": true,
      "human_handover.enabled": true, "sales_email_action.enabled": false,
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
    await adminClient!`
      INSERT INTO tenancy.quota_accounts (
        tenant_id, subscription_id, product_key, customer_unit, period_start,
        period_end, included_quantity, safety_cap_quantity
      ) VALUES (
        ${tenantId}::uuid, ${premiumSubscriptionId}::uuid, 'ai_chat', 'ai_response',
        now() - interval '1 minute', now() + interval '30 days', 100, 120
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
    const turn = await worker.beginTurn(claimed);
    expect(turn).toMatchObject({ tenantId, language: "en", turnSequence: 1, replayResponse: null });
    expect(turn.playbook).toBeTruthy(); expect(turn.authority).toBeTruthy();
    await worker.finish(claimed.outboxId, false, "gateway_unavailable");
    const retried = await worker.claim(new Date(Date.now() + 60_000));
    expect(retried).toMatchObject({ outboxId: claimed.outboxId, attemptCount: 2, processingAllowed: true });
    if (!retried) throw new Error("Expected social inbound retry.");
    const retriedTurn = await worker.beginTurn(retried);
    expect(retriedTurn).toMatchObject({ sessionId: turn.sessionId, conversationId: turn.conversationId, turnSequence: 1 });
    const socialRuntimeEvidence = await adminClient!<{
      subjects: number; contacts: number; conversations: number; sessions: number;
      turns: number; reservations: number; subject_plaintext: boolean;
    }[]>`
      SELECT
        1::int AS subjects,
        (SELECT count(*)::int FROM tenancy.contacts contact WHERE contact.tenant_id = subject.tenant_id AND contact.id = subject.contact_id) AS contacts,
        (SELECT count(*)::int FROM tenancy.conversations conversation WHERE conversation.tenant_id = subject.tenant_id AND conversation.id = subject.conversation_id AND conversation.channel_kind = 'line') AS conversations,
        (SELECT count(*)::int FROM tenancy.ai_sessions session WHERE session.tenant_id = subject.tenant_id AND session.id = subject.session_id) AS sessions,
        (SELECT count(*)::int FROM tenancy.ai_turns turn WHERE turn.tenant_id = subject.tenant_id AND turn.session_id = subject.session_id) AS turns,
        (SELECT count(*)::int FROM tenancy.usage_reservations reservation WHERE reservation.tenant_id = subject.tenant_id AND reservation.idempotency_key LIKE 'ai:social:turn:%') AS reservations,
        subject.external_subject_ciphertext LIKE '%line-user-123%' AS subject_plaintext
      FROM tenancy.ai_social_subjects subject
      WHERE subject.tenant_id = ${tenantId}::uuid
    `;
    expect(socialRuntimeEvidence[0]).toEqual({
      subjects: 1, contacts: 1, conversations: 1, sessions: 1,
      turns: 1, reservations: 1, subject_plaintext: false,
    });
    const firstStart = new Date(Date.now() + 172_800_000).toISOString();
    const secondStart = new Date(Date.now() + 259_200_000).toISOString();
    const customerResponse = "I recorded your consultation request. The merchant still needs to confirm a time.";
    const committed = await worker.commitTurn({
      outboxId: retried.outboxId,
      output: {
        schemaVersion: "sales-core.v1", stage: "S8_APPOINTMENT", intent: "request_consultation",
        facts: [], knowledgeCitations: [], responseGoal: "Capture and request consultation",
        proposedActions: [
          { type: "lead.capture", name: "LINE Customer", email: "line@example.test", need: "Consultation" },
          { type: "sales_fact.record", factType: "appointment_preference", value: "Weekday" },
          { type: "appointment.request", timezone: "Asia/Bangkok", confirmationClaim: "pending_merchant_confirmation", options: [
            { startAt: firstStart, endAt: new Date(new Date(firstStart).getTime() + 1_800_000).toISOString() },
            { startAt: secondStart, endAt: new Date(new Date(secondStart).getTime() + 1_800_000).toISOString() },
          ] },
        ],
        handover: null, customerResponse,
        channelResponse: { format: "text", quickReplies: ["Ask another question"] },
      },
      publicResponse: {
        status: "completed", inputId: claimed.receiptId, text: customerResponse,
        quickReplies: ["Ask another question"], nextTurnSequence: 2,
      },
      nativeUsage: { inputUnits: 90, outputUnits: 35, cachedUnits: 4 },
    });
    expect(committed).toMatchObject({ status: "completed", inputId: claimed.receiptId });
    await expect(worker.claim(new Date(Date.now() + 120_000))).resolves.toBeNull();
    const committedEvidence = await adminClient!<{
      leads: number; facts: number; appointments: number; options: number;
      outbound: number; ai_messages: number; settled: number; reserved: number; native_usage: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.leads lead WHERE lead.tenant_id = ${tenantId}::uuid AND lead.source = 'ai_chat_line') AS leads,
        (SELECT count(*)::int FROM tenancy.sales_facts fact WHERE fact.tenant_id = ${tenantId}::uuid) AS facts,
        (SELECT count(*)::int FROM tenancy.appointment_requests request WHERE request.tenant_id = ${tenantId}::uuid) AS appointments,
        (SELECT count(*)::int FROM tenancy.appointment_time_options option WHERE option.tenant_id = ${tenantId}::uuid) AS options,
        (SELECT count(*)::int FROM tenancy.ai_social_outbound_deliveries delivery WHERE delivery.tenant_id = ${tenantId}::uuid AND delivery.status = 'pending') AS outbound,
        (SELECT count(*)::int FROM tenancy.messages message WHERE message.tenant_id = ${tenantId}::uuid AND message.actor_type = 'ai') AS ai_messages,
        (SELECT count(*)::int FROM tenancy.usage_reservations reservation WHERE reservation.tenant_id = ${tenantId}::uuid AND reservation.status = 'settled' AND reservation.idempotency_key LIKE 'ai:social:turn:%') AS settled,
        (SELECT count(*)::int FROM tenancy.usage_reservations reservation WHERE reservation.tenant_id = ${tenantId}::uuid AND reservation.status = 'reserved' AND reservation.idempotency_key LIKE 'ai:social:turn:%') AS reserved,
        (SELECT count(*)::int FROM operations.ai_native_usage usage WHERE usage.tenant_id = ${tenantId}::uuid) AS native_usage
    `;
    expect(committedEvidence[0]).toEqual({
      leads: 1, facts: 1, appointments: 1, options: 2,
      outbound: 1, ai_messages: 1, settled: 1, reserved: 0, native_usage: 1,
    });
    const deliveryClaim = await worker.claimDelivery();
    expect(deliveryClaim).toMatchObject({
      channel: "line", recipient: "line-user-123", replyToken: "opaque-reply",
      deliveryAllowed: true, attemptCount: 1,
      response: { text: customerResponse, quickReplies: ["Ask another question"] },
      credentials: { channelAccessToken: "rotated-line-access-token" },
    });
    if (!deliveryClaim) throw new Error("Expected LINE delivery claim.");
    await worker.finishDelivery({
      deliveryId: deliveryClaim.deliveryId, delivered: false, externalMessageIds: [],
      feeClassification: "reply", attemptedQuantity: 1,
      safeErrorCode: "channel_rate_limited",
    });
    const retriedDelivery = await worker.claimDelivery(new Date(Date.now() + 60_000));
    expect(retriedDelivery).toMatchObject({ deliveryId: deliveryClaim.deliveryId, attemptCount: 2 });
    if (!retriedDelivery) throw new Error("Expected LINE delivery retry.");
    await worker.finishDelivery({
      deliveryId: retriedDelivery.deliveryId, delivered: true,
      externalMessageIds: ["line-outbound-1"], feeClassification: "reply",
      attemptedQuantity: 1, safeErrorCode: null,
    });
    const deliveryEvidence = await adminClient!<{
      status: string; attempts: number; quantity_events: number;
      failed_events: number; succeeded_events: number; external_message_id: string | null;
    }[]>`
      SELECT delivery.status, delivery.attempt_count AS attempts,
        (SELECT count(*)::int FROM tenancy.ai_social_channel_quantity_events event
          WHERE event.tenant_id = delivery.tenant_id AND event.delivery_id = delivery.id) AS quantity_events,
        (SELECT count(*)::int FROM tenancy.ai_social_channel_quantity_events event
          WHERE event.tenant_id = delivery.tenant_id AND event.delivery_id = delivery.id AND event.outcome = 'failed') AS failed_events,
        (SELECT count(*)::int FROM tenancy.ai_social_channel_quantity_events event
          WHERE event.tenant_id = delivery.tenant_id AND event.delivery_id = delivery.id AND event.outcome = 'succeeded') AS succeeded_events,
        delivery.external_message_ids[1] AS external_message_id
      FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.id = ${deliveryClaim.deliveryId}::uuid
    `;
    expect(deliveryEvidence[0]).toEqual({
      status: "succeeded", attempts: 2, quantity_events: 2,
      failed_events: 1, succeeded_events: 1, external_message_id: "line-outbound-1",
    });
    await runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-delivery-failed",
      externalMessageId: "line-outbound-1", subjectHash, eventType: "delivery.status",
      occurredAt: new Date(occurredAt.getTime() + 500),
      normalized: {
        text: null, subjectCiphertext, replyTokenCiphertext: null, deliveryStatus: "failed",
      },
    });
    const deliveryStatusClaim = await worker.claim();
    expect(deliveryStatusClaim).toMatchObject({
      eventType: "delivery.status", externalMessageId: "line-outbound-1", deliveryStatus: "failed",
    });
    if (!deliveryStatusClaim) throw new Error("Expected channel delivery status claim.");
    await expect(worker.applyControlEvent(deliveryStatusClaim.outboxId)).resolves.toBe(true);
    await expect(adminClient!<{ status: string; error: string }[]>`
      SELECT status, safe_error_code AS error
      FROM tenancy.ai_social_outbound_deliveries
      WHERE id = ${deliveryClaim.deliveryId}::uuid
    `).resolves.toEqual([{ status: "dead_letter", error: "channel_reported_failed" }]);
    await runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-dead-letter",
      externalMessageId: "line-message-dead-letter", subjectHash, eventType: "inbound.message",
      occurredAt: new Date(occurredAt.getTime() + 1_000),
      normalized: { text: "Dead letter proof", subjectCiphertext, replyTokenCiphertext: null, deliveryStatus: null },
    });
    const deadLetterClaim = await worker.claim();
    if (!deadLetterClaim) throw new Error("Expected social inbound dead-letter claim.");
    await expect(worker.beginTurn(deadLetterClaim)).resolves.toMatchObject({ turnSequence: 2 });
    await expect(worker.failTurn(deadLetterClaim.outboxId, "structured_output_invalid")).resolves.toBe(true);
    await worker.finish(deadLetterClaim.outboxId, false, "structured_output_invalid", true);
    await expect(adminClient!<{
      status: string; error: string; turn_status: string; turn_error: string; reservation_status: string;
    }[]>`
      SELECT outbox.status, outbox.last_error_code AS error,
        turn.status AS turn_status, turn.safe_error_code AS turn_error,
        reservation.status AS reservation_status
      FROM tenancy.outbox outbox
      JOIN tenancy.ai_turns turn
        ON turn.tenant_id = outbox.tenant_id AND turn.input_id = ${deadLetterClaim.receiptId}::uuid
      JOIN tenancy.usage_reservations reservation
        ON reservation.tenant_id = turn.tenant_id AND reservation.id = turn.usage_reservation_id
      WHERE outbox.id = ${deadLetterClaim.outboxId}::uuid
    `).resolves.toEqual([{
      status: "dead_letter", error: "structured_output_invalid",
      turn_status: "failed", turn_error: "structured_output_invalid", reservation_status: "released",
    }]);

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
    expect(evidence[0]).toEqual({ receipts: 4, accepted: 3, out_of_order: 1, jobs: 3, credential_plaintext: false });

    await runtime.receive({
      webhookKey: created.webhookKey, channel: "line", externalEventId: "line-event-opt-out",
      externalMessageId: null, subjectHash, eventType: "subject.opt_out",
      occurredAt: new Date(occurredAt.getTime() + 2_000),
      normalized: { text: null, subjectCiphertext, replyTokenCiphertext: null, deliveryStatus: null },
    });
    const optOutClaim = await worker.claim();
    expect(optOutClaim).toMatchObject({ eventType: "subject.opt_out", externalSubject: "line-user-123" });
    if (!optOutClaim) throw new Error("Expected LINE opt-out claim.");
    await expect(worker.applyControlEvent(optOutClaim.outboxId)).resolves.toBe(true);
    await expect(adminClient!<{
      subject_status: string; conversation_status: string; automation_mode: string;
      session_status: string; outbox_status: string;
    }[]>`
      SELECT subject.status AS subject_status, conversation.status AS conversation_status,
        conversation.automation_mode, session.status AS session_status,
        outbox.status AS outbox_status
      FROM tenancy.ai_social_subjects subject
      JOIN tenancy.conversations conversation
        ON conversation.tenant_id = subject.tenant_id AND conversation.id = subject.conversation_id
      JOIN tenancy.ai_sessions session
        ON session.tenant_id = subject.tenant_id AND session.id = subject.session_id
      JOIN tenancy.outbox outbox ON outbox.tenant_id = subject.tenant_id
        AND outbox.id = ${optOutClaim.outboxId}::uuid
      WHERE subject.tenant_id = ${tenantId}::uuid
        AND subject.connection_id = ${created.connectionId}::uuid
        AND subject.subject_hash = ${subjectHash}
    `).resolves.toEqual([{
      subject_status: "opted_out", conversation_status: "closed",
      automation_mode: "closed", session_status: "completed", outbox_status: "sent",
    }]);

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
