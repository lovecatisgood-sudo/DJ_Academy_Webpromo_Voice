import { randomUUID } from "node:crypto";
import { sealJson } from "@djay/auth";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { AiChatStore } from "./ai-chat-store";
import { AiSocialConnectionStore, AiSocialRuntimeStore, AiSocialWorkerStore } from "./ai-social-store";
import { createDatabaseClient } from "./client";
import { PostgresPlatformAuthStore } from "./platform-auth-store";
import { SharedDomainStore } from "./shared-domain-store";

const runtimeUrl = process.env.AI_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const platformUrl = process.env.PLATFORM_DATABASE_URL;
const enabled = Boolean(runtimeUrl && tenantUrl && adminUrl && workerUrl && platformUrl);
const runtimeClient = enabled ? createDatabaseClient(runtimeUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;

afterAll(async () => {
  await runtimeClient?.end(); await tenantClient?.end(); await adminClient?.end();
  await workerClient?.end(); await platformClient?.end();
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
    // CHN-004: the subscription includes ONE social channel; every additional channel
    // needs a paid `additional_social_channel` add-on. This merchant has bought one
    // extra slot, so alongside the included LINE channel they may run one more at a
    // time -- WhatsApp below, then Messenger once WhatsApp is revoked. Quantity 1 rather
    // than 2 deliberately: it proves the allowance is counted against currently-active
    // channels rather than merely present.
    await adminClient!`
      INSERT INTO tenancy.subscription_add_ons (
        tenant_id, subscription_id, add_on_key, quantity, status, effective_from
      ) VALUES (
        ${tenantId}::uuid, ${premiumSubscriptionId}::uuid, 'additional_social_channel',
        1, 'active', now() - interval '1 minute'
      )
    `;
    const existingContactId = randomUUID();
    await adminClient!`
      INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale, consent_status)
      VALUES (${existingContactId}::uuid, ${tenantId}::uuid, 'Existing CRM customer', 'en', 'unknown')
    `;
    await adminClient!`
      INSERT INTO tenancy.contact_identities (
        tenant_id, contact_id, identity_kind, normalized_value, verification_status, verified_at
      ) VALUES (
        ${tenantId}::uuid, ${existingContactId}::uuid, 'email', 'line@example.test', 'verified', now()
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.contact_identities (
        tenant_id, contact_id, identity_kind, normalized_value, verification_status, verified_at
      ) VALUES (
        ${tenantId}::uuid, ${existingContactId}::uuid, 'phone', '+66812345678', 'verified', now()
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
        confidence: 0.9, safety: { state: "allowed", reasonCodes: [] },
        facts: [], knowledgeCitations: [], responseGoal: "Capture and request consultation",
        proposedActions: [
          { type: "lead.capture", name: "LINE Customer", email: "line@example.test", phone: "+66 81-234-5678", consentStatus: "granted", need: "Consultation" },
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
      outbound: number; ai_messages: number; settled: number; reserved: number;
      native_usage: number; fundingIncluded: number;
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
        (SELECT (reservation.funding_json->>'included')::numeric::int
          FROM tenancy.usage_reservations reservation
          WHERE reservation.tenant_id = ${tenantId}::uuid
            AND reservation.idempotency_key LIKE 'ai:social:turn:%'
          ORDER BY reservation.created_at LIMIT 1) AS "fundingIncluded",
        (SELECT count(*)::int FROM operations.ai_native_usage usage WHERE usage.tenant_id = ${tenantId}::uuid) AS native_usage
    `;
    expect(committedEvidence[0]).toEqual({
      leads: 1, facts: 1, appointments: 1, options: 2,
      outbound: 1, ai_messages: 1, settled: 1, reserved: 0,
      native_usage: 1, fundingIncluded: 1,
    });
    const identityReviews = await new SharedDomainStore(tenantClient!).listIdentityReviewCandidates(context);
    expect(identityReviews).toHaveLength(2);
    expect(identityReviews).toEqual(expect.arrayContaining([
      expect.objectContaining({
        sourceContactId: expect.any(String), sourceContactName: "LINE Customer",
        candidateContactId: existingContactId, candidateContactName: "Existing CRM customer",
        identityKind: "email", matchValue: "line@example.test",
      }),
      expect.objectContaining({
        sourceContactId: expect.any(String), sourceContactName: "LINE Customer",
        candidateContactId: existingContactId, candidateContactName: "Existing CRM customer",
        identityKind: "phone", matchValue: "+66812345678",
      }),
    ]));
    expect(identityReviews[0]?.sourceContactId).not.toBe(existingContactId);
    await expect(adminClient!<{ merged: number }[]>`
      SELECT count(*)::int AS merged FROM tenancy.contacts
      WHERE tenant_id = ${tenantId}::uuid AND status = 'merged'
    `).resolves.toEqual([{ merged: 0 }]);
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

    const whatsapp = await connections.createWhatsApp(context, {
      agentId: agent.agentId, name: "Main WhatsApp", externalAccountRef: "wa-business-tenant-b",
      credentials: { channel: "whatsapp", accessToken: "whatsapp-access-token-value",
        appSecret: "whatsapp-app-secret-value", verifyToken: "whatsapp-verify-token-value",
        phoneNumberId: "phone-number-123", businessAccountId: "business-account-123" },
      envelopeKey,
    });
    expect(whatsapp.status).toBe("created");
    if (whatsapp.status !== "created") throw new Error("Expected WhatsApp connection.");
    await expect(connections.rotateWhatsApp(context, {
      connectionId: whatsapp.connectionId, envelopeKey,
      credentials: { channel: "whatsapp", accessToken: "rotated-whatsapp-access-token",
        appSecret: "rotated-whatsapp-app-secret", verifyToken: "rotated-whatsapp-verify-token",
        phoneNumberId: "phone-number-123", businessAccountId: "business-account-123" },
    })).resolves.toEqual({ status: "rotated", credentialKeyVersion: 2 });
    await expect(runtime.connection(whatsapp.webhookKey, "whatsapp")).resolves.toMatchObject({
      connectionId: whatsapp.connectionId,
      credentials: { channel: "whatsapp", phoneNumberId: "phone-number-123" },
    });
    const waOccurredAt = new Date(); const waSubjectHash = Buffer.alloc(32, 31);
    const waSubjectCiphertext = sealJson({ value: "66810000000" }, envelopeKey);
    await runtime.receive({
      webhookKey: whatsapp.webhookKey, channel: "whatsapp", externalEventId: "wa-message-1",
      externalMessageId: "wa-message-1", subjectHash: waSubjectHash, eventType: "inbound.message",
      occurredAt: waOccurredAt,
      normalized: { text: "WhatsApp hello", subjectCiphertext: waSubjectCiphertext,
        replyTokenCiphertext: null, deliveryStatus: null },
    });
    const waClaim = await worker.claim();
    if (!waClaim) throw new Error("Expected WhatsApp inbound claim.");
    const waTurn = await worker.beginTurn(waClaim);
    const waResponse = "WhatsApp reply inside the service window.";
    await worker.commitTurn({ outboxId: waClaim.outboxId,
      output: { schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover",
        confidence: 0.8, safety: { state: "allowed", reasonCodes: [] },
        facts: [], knowledgeCitations: [], responseGoal: "Continue discovery", proposedActions: [],
        handover: null, customerResponse: waResponse,
        channelResponse: { format: "text", quickReplies: [] } },
      publicResponse: { status: "completed", inputId: waClaim.receiptId, text: waResponse,
        quickReplies: [], nextTurnSequence: waTurn.turnSequence + 1 },
      nativeUsage: { inputUnits: 20, outputUnits: 10 },
    });
    const waDelivery = await worker.claimDelivery(new Date(waOccurredAt.getTime() + 60 * 60 * 1000));
    expect(waDelivery).toMatchObject({ channel: "whatsapp", serviceWindowOpen: true,
      deliveryAllowed: true, recipient: "66810000000" });
    if (!waDelivery) throw new Error("Expected WhatsApp delivery claim.");
    await worker.finishDelivery({ deliveryId: waDelivery.deliveryId, delivered: false,
      externalMessageIds: ["wamid.outbound-part-1"], feeClassification: "service_window_reply",
      attemptedQuantity: 2, completedPartCount: 1, safeErrorCode: "channel_rate_limited" });
    const waRetry = await worker.claimDelivery(new Date(waOccurredAt.getTime() + 60 * 60 * 1000 + 120_000));
    expect(waRetry).toMatchObject({ deliveryId: waDelivery.deliveryId,
      deliveredPartCount: 1, attemptCount: 2, deliveryAllowed: true });
    if (!waRetry) throw new Error("Expected partial WhatsApp delivery retry.");
    await worker.finishDelivery({ deliveryId: waRetry.deliveryId, delivered: true,
      externalMessageIds: ["wamid.outbound-part-2"], feeClassification: "service_window_reply",
      attemptedQuantity: 1, completedPartCount: 1, safeErrorCode: null });
    await expect(adminClient!<{
      status: string; delivered_parts: number; external_message_ids: string[];
      quantity_events: number; attempted_quantity: number;
    }[]>`
      SELECT delivery.status, delivery.delivered_part_count AS delivered_parts,
        delivery.external_message_ids,
        (SELECT count(*)::int FROM tenancy.ai_social_channel_quantity_events event
         WHERE event.tenant_id = delivery.tenant_id AND event.delivery_id = delivery.id) AS quantity_events,
        (SELECT sum(event.attempted_quantity)::int FROM tenancy.ai_social_channel_quantity_events event
         WHERE event.tenant_id = delivery.tenant_id AND event.delivery_id = delivery.id) AS attempted_quantity
      FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.id = ${waDelivery.deliveryId}::uuid
    `).resolves.toEqual([{
      status: "succeeded", delivered_parts: 2,
      external_message_ids: ["wamid.outbound-part-1", "wamid.outbound-part-2"],
      quantity_events: 2, attempted_quantity: 3,
    }]);

    await runtime.receive({
      webhookKey: whatsapp.webhookKey, channel: "whatsapp", externalEventId: "wa-message-2",
      externalMessageId: "wa-message-2", subjectHash: waSubjectHash, eventType: "inbound.message",
      occurredAt: new Date(waOccurredAt.getTime() + 1_000),
      normalized: { text: "Another question", subjectCiphertext: waSubjectCiphertext,
        replyTokenCiphertext: null, deliveryStatus: null },
    });
    const waLateClaim = await worker.claim();
    if (!waLateClaim) throw new Error("Expected second WhatsApp inbound claim.");
    const waLateTurn = await worker.beginTurn(waLateClaim); const waLateResponse = "A later reply.";
    await worker.commitTurn({ outboxId: waLateClaim.outboxId,
      output: { schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover",
        confidence: 0.8, safety: { state: "allowed", reasonCodes: [] },
        facts: [], knowledgeCitations: [], responseGoal: "Continue discovery", proposedActions: [],
        handover: null, customerResponse: waLateResponse,
        channelResponse: { format: "text", quickReplies: [] } },
      publicResponse: { status: "completed", inputId: waLateClaim.receiptId, text: waLateResponse,
        quickReplies: [], nextTurnSequence: waLateTurn.turnSequence + 1 },
      nativeUsage: { inputUnits: 15, outputUnits: 8 },
    });
    const waClosedDelivery = await worker.claimDelivery(new Date(waOccurredAt.getTime() + 25 * 60 * 60 * 1000));
    expect(waClosedDelivery).toMatchObject({ channel: "whatsapp", serviceWindowOpen: false,
      deliveryAllowed: false, recipient: null, credentials: null });
    if (!waClosedDelivery) throw new Error("Expected closed-window WhatsApp delivery claim.");
    await worker.finishDelivery({ deliveryId: waClosedDelivery.deliveryId, delivered: false,
      externalMessageIds: [], feeClassification: "service_window_reply", attemptedQuantity: 0,
      safeErrorCode: "social_service_window_closed", deadLetter: true });
    await expect(adminClient!<{ status: string; error: string; quantity_events: number }[]>`
      SELECT delivery.status, delivery.safe_error_code AS error,
        (SELECT count(*)::int FROM tenancy.ai_social_channel_quantity_events event
         WHERE event.tenant_id = delivery.tenant_id AND event.delivery_id = delivery.id) AS quantity_events
      FROM tenancy.ai_social_outbound_deliveries delivery
      WHERE delivery.id = ${waClosedDelivery.deliveryId}::uuid
    `).resolves.toEqual([{ status: "dead_letter", error: "social_service_window_closed", quantity_events: 0 }]);
    await expect(connections.revoke(context, whatsapp.connectionId)).resolves.toEqual({ status: "revoked" });

    const messenger = await connections.createMessenger(context, {
      agentId: agent.agentId, name: "Main Messenger", externalAccountRef: "messenger-page-tenant-b",
      credentials: { channel: "messenger", pageAccessToken: "messenger-page-access-token",
        appSecret: "messenger-app-secret-value", verifyToken: "messenger-verify-token-value",
        pageId: "messenger-page-123" },
      envelopeKey,
    });
    expect(messenger.status).toBe("created");
    if (messenger.status !== "created") throw new Error("Expected Messenger connection.");
    await expect(connections.rotateMessenger(context, {
      connectionId: messenger.connectionId, envelopeKey,
      credentials: { channel: "messenger", pageAccessToken: "rotated-messenger-page-token",
        appSecret: "rotated-messenger-app-secret", verifyToken: "rotated-messenger-verify-token",
        pageId: "messenger-page-123" },
    })).resolves.toEqual({ status: "rotated", credentialKeyVersion: 2 });
    await expect(runtime.connection(messenger.webhookKey, "messenger")).resolves.toMatchObject({
      connectionId: messenger.connectionId,
      credentials: { channel: "messenger", pageId: "messenger-page-123" },
    });
    const messengerOccurredAt = new Date(); const messengerSubjectHash = Buffer.alloc(32, 47);
    await runtime.receive({
      webhookKey: messenger.webhookKey, channel: "messenger", externalEventId: "messenger-message-1",
      externalMessageId: "messenger-message-1", subjectHash: messengerSubjectHash,
      eventType: "inbound.message", occurredAt: messengerOccurredAt,
      normalized: { text: "Messenger hello",
        subjectCiphertext: sealJson({ value: "PSID-123" }, envelopeKey),
        replyTokenCiphertext: null, deliveryStatus: null },
    });
    const messengerClaim = await worker.claim();
    if (!messengerClaim) throw new Error("Expected Messenger inbound claim.");
    const messengerTurn = await worker.beginTurn(messengerClaim);
    const messengerResponse = "Messenger reply inside the service window.";
    await worker.commitTurn({ outboxId: messengerClaim.outboxId,
      output: { schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover",
        confidence: 0.8, safety: { state: "allowed", reasonCodes: [] },
        facts: [], knowledgeCitations: [], responseGoal: "Continue discovery", proposedActions: [],
        handover: null, customerResponse: messengerResponse,
        channelResponse: { format: "text", quickReplies: ["Book"] } },
      publicResponse: { status: "completed", inputId: messengerClaim.receiptId,
        text: messengerResponse, quickReplies: ["Book"],
        nextTurnSequence: messengerTurn.turnSequence + 1 },
      nativeUsage: { inputUnits: 12, outputUnits: 7 },
    });
    const messengerDelivery = await worker.claimDelivery(
      new Date(messengerOccurredAt.getTime() + 60 * 60 * 1000),
    );
    expect(messengerDelivery).toMatchObject({ channel: "messenger", serviceWindowOpen: true,
      deliveryAllowed: true, recipient: "PSID-123", deliveredPartCount: 0 });
    if (!messengerDelivery) throw new Error("Expected Messenger delivery claim.");
    await worker.finishDelivery({ deliveryId: messengerDelivery.deliveryId, delivered: true,
      externalMessageIds: ["mid.outbound-1"], feeClassification: "service_window_reply",
      attemptedQuantity: 1, completedPartCount: 1, safeErrorCode: null });
    const crossChannelAnalytics = await authoring.analytics(context);
    expect(crossChannelAnalytics).toMatchObject({
      sessions: 3, completedTurns: 4, failedTurns: 1, leads: 1,
      appointmentRequests: 1, settledResponses: 4,
    });
    expect(crossChannelAnalytics?.channels).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "web", sessions: 0, completedTurns: 0,
        leads: 0, delivered: 0, attemptedQuantity: 0 }),
      expect.objectContaining({ channel: "line", sessions: 1, completedTurns: 1,
        failedTurns: 1, leads: 1, appointmentRequests: 1,
        delivered: 0, failedDeliveries: 1, attemptedQuantity: 2 }),
      expect.objectContaining({ channel: "whatsapp", sessions: 1, completedTurns: 2,
        failedTurns: 0, delivered: 1, failedDeliveries: 1, attemptedQuantity: 3 }),
      expect.objectContaining({ channel: "messenger", sessions: 1, completedTurns: 1,
        failedTurns: 0, delivered: 1, failedDeliveries: 0, attemptedQuantity: 1 }),
    ]));
    const platformHealth = await new PostgresPlatformAuthStore(platformClient!).healthSummary();
    expect(platformHealth.socialChannels).toEqual(expect.arrayContaining([
      expect.objectContaining({ channel: "line", activeConnections: 1,
        deadLetterDeliveries: 1, attemptedQuantity24h: 2 }),
      expect.objectContaining({ channel: "whatsapp", activeConnections: 0,
        deadLetterDeliveries: 1, serviceWindowClosed24h: 1,
        attemptedQuantity24h: 3, failedAttempts24h: 1 }),
      expect.objectContaining({ channel: "messenger", activeConnections: 1,
        deadLetterDeliveries: 0, attemptedQuantity24h: 1 }),
    ]));
    await expect(connections.revoke(context, messenger.connectionId)).resolves.toEqual({ status: "revoked" });

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
          accessMode: "active", entitlements: {
            ...premiumEntitlements, "channel.line": false, "channel.whatsapp": false,
            "channel.messenger": false,
          },
          allowances: {}, overageRatesMinor: {}, limits: { deployments: 5 }, resolvedAt: new Date().toISOString(),
        })}, digest(${basicSnapshotId}, 'sha256')
      )
    `;
    await expect(connections.createLine(context, {
      agentId: agent.agentId, name: "Denied LINE", externalAccountRef: "line-account-basic",
      credentials: { channel: "line" }, envelopeKey,
    })).resolves.toEqual({ status: "not_entitled" });
    await expect(connections.createWhatsApp(context, {
      agentId: agent.agentId, name: "Denied WhatsApp", externalAccountRef: "wa-account-basic",
      credentials: { channel: "whatsapp" }, envelopeKey,
    })).resolves.toEqual({ status: "not_entitled" });
    await expect(connections.createMessenger(context, {
      agentId: agent.agentId, name: "Denied Messenger", externalAccountRef: "messenger-account-basic",
      credentials: { channel: "messenger" }, envelopeKey,
    })).resolves.toEqual({ status: "not_entitled" });
  });
});
