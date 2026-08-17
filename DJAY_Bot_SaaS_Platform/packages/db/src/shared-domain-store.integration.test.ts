import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { SharedDomainStore } from "./shared-domain-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("P3 shared domain repositories", () => {
  it("keeps contacts, conversations, actions, knowledge, and privacy tenant-scoped and idempotent", async () => {
    const contextA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "shared-domain-a",
    });
    const contextB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "shared-domain-b",
    });
    const active = await adminClient!<{
      subscription_id: string; snapshot_id: string; product_key: "ai_chat"; plan_key: "ai_chat_basic";
    }[]>`
      SELECT subscription.id AS subscription_id, snapshot.id AS snapshot_id,
             subscription.product_key, plan.plan_key
      FROM tenancy.product_subscriptions subscription
      JOIN catalog.plan_versions version ON version.id = subscription.plan_version_id
      JOIN catalog.plans plan ON plan.id = version.plan_id
      JOIN LATERAL (
        SELECT id FROM tenancy.entitlement_snapshots candidate
        WHERE candidate.tenant_id = subscription.tenant_id
          AND candidate.subscription_id = subscription.id AND candidate.access_mode = 'active'
        ORDER BY candidate.created_at DESC LIMIT 1
      ) snapshot ON true
      WHERE subscription.tenant_id = ${contextA.tenantId}::uuid AND subscription.status = 'active'
      LIMIT 1
    `;
    expect(active[0]).toBeTruthy();
    const authority = active[0]!;
    const store = new SharedDomainStore(tenantClient!);
    const contactInput = {
      displayName: "Shared Customer", email: "shared-customer@example.test",
      locale: "en" as const, consentStatus: "granted" as const,
    };
    const contactA = await store.createContact(contextA, contactInput);
    expect(contactA.status).toBe("created");
    if (contactA.status !== "created") throw new Error("Expected contact A.");
    await expect(store.createContact(contextA, contactInput)).resolves.toEqual({
      status: "review_required", candidateContactIds: [contactA.contactId],
    });
    const contactB = await store.createContact(contextB, contactInput);
    expect(contactB.status).toBe("created");
    expect(await store.listContacts(contextA)).toHaveLength(1);
    expect(await store.listContacts(contextB)).toHaveLength(1);

    const lead = await store.createLead(contextA, {
      contactId: contactA.contactId, title: "Website enquiry", source: "integration", status: "new",
    });
    expect(lead.status).toBe("created");
    if (lead.status !== "created") throw new Error("Expected lead.");
    const conversation = await store.createConversation(contextA, {
      contactId: contactA.contactId, leadId: lead.leadId,
      productKey: authority.product_key, publicPlanKey: authority.plan_key,
      entitlementSnapshotId: authority.snapshot_id, channelKind: "web", automationMode: "ai_text",
    });
    expect(conversation.status).toBe("created");
    if (conversation.status !== "created") throw new Error("Expected conversation.");
    await expect(store.createConversation(contextB, {
      contactId: contactA.contactId, leadId: lead.leadId,
      productKey: authority.product_key, publicPlanKey: authority.plan_key,
      entitlementSnapshotId: authority.snapshot_id, channelKind: "web", automationMode: "ai_text",
    })).resolves.toEqual({ status: "not_entitled_or_not_found" });

    await expect(store.appendMessage(contextA, conversation.conversationId, {
      actorType: "human", direction: "outbound", text: "Premature reply",
    })).resolves.toEqual({ status: "handover_required" });
    await adminClient!`INSERT INTO tenancy.messages (
        id, tenant_id, conversation_id, sequence, actor_type, direction, content_json, created_at
      ) VALUES (${randomUUID()}::uuid, ${contextA.tenantId}::uuid, ${conversation.conversationId}::uuid,
        1, 'ai', 'outbound', ${adminClient!.json({ text: "This response is exactly at the cutoff." })},
        now() - interval '5 minutes')`;
    await adminClient!`UPDATE tenancy.conversations SET next_sequence = 2
      WHERE tenant_id = ${contextA.tenantId}::uuid AND id = ${conversation.conversationId}::uuid`;
    await expect(store.takeOverConversation({ ...contextA, requestId: "takeover-at-five-minutes" }, conversation.conversationId))
      .resolves.toMatchObject({ status: "takeover_window_expired" });
    expect((await store.listInbox(contextA))[0]).toMatchObject({ takeoverEligible: false });
    await adminClient!`INSERT INTO tenancy.messages (
        id, tenant_id, conversation_id, sequence, actor_type, direction, content_json, created_at
      ) VALUES (${randomUUID()}::uuid, ${contextA.tenantId}::uuid, ${conversation.conversationId}::uuid,
        2, 'ai', 'outbound', ${adminClient!.json({ text: "This response is inside the takeover window." })},
        now() - interval '4 minutes')`;
    await adminClient!`UPDATE tenancy.conversations SET next_sequence = 3
      WHERE tenant_id = ${contextA.tenantId}::uuid AND id = ${conversation.conversationId}::uuid`;
    expect((await store.listInbox(contextA))[0]).toMatchObject({ takeoverEligible: true });
    await expect(store.takeOverConversation({ ...contextA, requestId: "takeover-inside-five-minutes" }, conversation.conversationId))
      .resolves.toEqual({ status: "accepted", replayed: false });
    await expect(store.appendMessage(contextA, conversation.conversationId, {
      actorType: "human", direction: "outbound", text: "   ",
    })).rejects.toThrow();
    const [first, second] = await Promise.all([
      store.appendMessage(contextA, conversation.conversationId, {
        actorType: "customer", direction: "inbound", text: "I need help", externalMessageId: "external-message-1",
      }),
      store.appendMessage(contextA, conversation.conversationId, {
        actorType: "human", direction: "outbound", text: "  We can help with that  ",
      }),
    ]);
    expect([first, second].map((item) => "sequence" in item ? item.sequence : 0).sort()).toEqual([3, 4]);
    await expect(store.appendMessage(contextA, conversation.conversationId, {
      actorType: "customer", direction: "inbound", text: "duplicate body ignored", externalMessageId: "external-message-1",
    })).resolves.toMatchObject({ status: "replayed" });
    const conversationMessages = await store.listMessages(contextA, conversation.conversationId);
    expect(conversationMessages).toHaveLength(4);
    expect(conversationMessages.some((message) => message.text === "We can help with that")).toBe(true);
    expect(await store.listMessages(contextB, conversation.conversationId)).toHaveLength(0);
    expect(await store.listInbox(contextA)).toHaveLength(1);
    expect(await store.listInbox(contextB)).toHaveLength(0);
    await expect(store.releaseConversation(contextA, conversation.conversationId)).resolves.toEqual({ status: "released", automationMode: "ai_text" });

    const retention = await store.getRetentionPolicy(contextA);
    expect(retention).toMatchObject({ transcriptDays: 365, recordingDays: 0 });
    await expect(store.updateRetentionPolicy(contextA, 90)).resolves.toMatchObject({
      status: "updated", transcriptDays: 90, recordingDays: 0,
    });
    await expect(store.getRetentionPolicy(contextA)).resolves.toMatchObject({ transcriptDays: 90, recordingDays: 0 });

    await expect(store.createKnowledgeSource(contextA, {
      name: "Service facts", sourceKind: "text", content: "Approved service information.",
    })).resolves.toMatchObject({ status: "created" });
    expect(await store.listKnowledge(contextA)).toHaveLength(1);
    expect(await store.listKnowledge(contextB)).toHaveLength(0);

    const action = {
      type: "follow_up.create" as const, idempotencyKey: `follow-up-${randomUUID()}`,
      leadId: lead.leadId, dueAt: new Date(Date.now() + 86_400_000).toISOString(), note: "Call the customer",
    };
    const actionResult = await store.executeAction(contextA, authority.snapshot_id, action);
    expect(actionResult.status).toBe("succeeded");
    await expect(store.executeAction(contextA, authority.snapshot_id, action)).resolves.toMatchObject({
      status: "replayed", actionRequestId: "actionRequestId" in actionResult ? actionResult.actionRequestId : "missing",
    });
    await expect(store.executeAction(contextB, authority.snapshot_id, action)).resolves.toEqual({ status: "denied" });

    const appointmentAction = {
      type: "appointment.request" as const, idempotencyKey: `appointment-${randomUUID()}`,
      leadId: lead.leadId, timezone: "Asia/Bangkok",
      options: [{ startAt: new Date(Date.now() + 172_800_000).toISOString(), endAt: new Date(Date.now() + 176_400_000).toISOString() }],
    };
    await expect(store.executeAction(contextA, authority.snapshot_id, appointmentAction)).resolves.toMatchObject({ status: "succeeded" });
    const appointment = await adminClient!<{ status: string }[]>`
      SELECT status FROM tenancy.appointment_requests WHERE tenant_id = ${contextA.tenantId}::uuid
        AND idempotency_key = ${appointmentAction.idempotencyKey}
    `;
    expect(appointment[0]?.status).toBe("requested");
    const appointments = await store.listAppointments(contextA);
    expect(appointments).toHaveLength(1);
    expect(await store.listAppointments(contextB)).toHaveLength(0);
    const appointmentRecord = appointments[0]!; const option = appointmentRecord.options[0]!;
    await expect(store.updateAppointment(contextB, appointmentRecord.id, { status: "confirmed", optionId: option.id })).resolves.toEqual({ status: "not_found" });
    await expect(store.updateAppointment(contextA, appointmentRecord.id, { status: "confirmed", optionId: option.id, notes: "Confirmed by phone" })).resolves.toEqual({ status: "accepted" });
    await expect(store.updateAppointment(contextA, appointmentRecord.id, { status: "completed" })).resolves.toEqual({ status: "accepted" });
    await expect(store.updateAppointment(contextA, appointmentRecord.id, { status: "cancelled" })).resolves.toEqual({ status: "invalid_transition" });
    expect((await store.listAppointments(contextA))[0]).toMatchObject({
      status: "completed", notes: "Confirmed by phone",
      history: [
        { fromStatus: null, toStatus: "requested" },
        { fromStatus: "requested", toStatus: "confirmed" },
        { fromStatus: "confirmed", toStatus: "completed" },
      ],
    });

    await expect(store.updateLeadStatus(contextA, lead.leadId, "closed_deal")).resolves.toMatchObject({ status: "accepted" });
    expect((await store.listLeads(contextA)).find((item) => item.id === lead.leadId)).toMatchObject({
      contactId: contactA.contactId, status: "closed_deal",
    });
    const valueAuthority = await tenantClient!.begin(async (sql) => {
      await sql`SELECT set_config('app.tenant_id', ${contextA.tenantId}, true),
        set_config('app.user_id', ${contextA.userId}, true),
        set_config('app.membership_id', ${contextA.membershipId}, true)`;
      return sql<{ membership: boolean; closedLead: boolean }[]>`SELECT
        EXISTS (SELECT 1 FROM tenancy.memberships membership WHERE membership.tenant_id = tenancy.current_tenant_id()
          AND membership.id = ${contextA.membershipId}::uuid AND membership.user_id = ${contextA.userId}::uuid
          AND membership.status = 'active') AS membership,
        EXISTS (SELECT 1 FROM tenancy.leads candidate JOIN tenancy.contacts contact
          ON contact.tenant_id = candidate.tenant_id AND contact.id = candidate.contact_id
          WHERE candidate.tenant_id = tenancy.current_tenant_id() AND candidate.id = ${lead.leadId}::uuid
            AND candidate.contact_id = ${contactA.contactId}::uuid AND candidate.status = 'closed_deal'
            AND contact.status = 'active') AS "closedLead"`;
    });
    expect(valueAuthority[0]).toEqual({ membership: true, closedLead: true });
    const valueInput = {
      contactId: contactA.contactId, leadId: lead.leadId,
      amountMinor: 125_000, currency: "THB", idempotencyKey: randomUUID(),
    };
    const value = await store.recordCustomerDealValue(contextA, valueInput);
    expect(value).toMatchObject({ status: "recorded" });
    await expect(store.recordCustomerDealValue(contextA, valueInput)).resolves.toEqual(value);
    await expect(store.recordCustomerDealValue(contextB, valueInput)).resolves.toEqual({ status: "not_found_or_invalid" });
    const revokedContext = createTenantContext({
      tenantId: contextA.tenantId, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(),
      role: "tenant_admin", requestId: `revoked-value-${randomUUID()}`,
    });
    await expect(store.recordCustomerDealValue(revokedContext, { ...valueInput, idempotencyKey: randomUUID() }))
      .resolves.toEqual({ status: "not_found_or_invalid" });
    const journey = await store.getCustomerJourney(contextA, contactA.contactId);
    expect(journey).toMatchObject({
      contact: { id: contactA.contactId, conversationCount: 1, appointmentCount: 1 },
      values: [{ currency: "THB", amountMinor: "125000" }],
    });
    expect(journey?.events.some((event) => event.kind === "deal_value" && event.amountMinor === "125000")).toBe(true);
    expect(journey?.events.some((event) => event.kind === "appointment_status" && event.title === "Appointment: completed")).toBe(true);
    await expect(store.getCustomerJourney(contextB, contactA.contactId)).resolves.toBeNull();
    const report = await store.operationsReport(contextA, { days: 30 });
    expect(report).toMatchObject({
      productKey: null,
      summary: { conversations: 1, leads: 1, appointments: 1, completedAppointments: 1 },
      values: [{ currency: "THB", amountMinor: "125000", events: 1 }],
      products: [{ productKey: "ai_chat", conversations: 1 }],
    });
    await expect(store.operationsReport(contextA, { days: 30, productKey: "ai_chat" })).resolves.toMatchObject({
      summary: { conversations: 1, leads: 1, appointments: 1 },
      values: [{ currency: "THB", amountMinor: "125000", events: 1 }],
    });
    await expect(store.operationsReport(contextA, { days: 30, productKey: "flowbot" })).resolves.toMatchObject({
      summary: { conversations: 0, leads: 0, appointments: 0, callbacks: 0 }, values: [],
    });
    await expect(store.operationsReport(contextB, { days: 30 })).resolves.toMatchObject({
      summary: { conversations: 0, leads: 0, appointments: 0, callbacks: 0 }, values: [],
    });
    if (value.status !== "recorded") throw new Error("Expected value evidence.");
    await expect(adminClient!`UPDATE tenancy.customer_value_events SET amount_minor = 1 WHERE id = ${value.valueEventId}::uuid`).rejects.toThrow(/immutable/i);

    const privacyKey = `privacy-${randomUUID()}`;
    const privacy = await store.requestPrivacyJob(contextA, {
      jobType: "export", contactId: contactA.contactId, idempotencyKey: privacyKey,
    });
    expect(privacy.status).toBe("accepted");
    if (privacy.status !== "accepted") throw new Error("privacy export was not accepted");
    await expect(store.requestPrivacyJob(contextA, {
      jobType: "export", contactId: contactA.contactId, idempotencyKey: privacyKey,
    })).resolves.toEqual(privacy);
    await expect(store.requestPrivacyJob(contextA, {
      jobType: "erasure", contactId: contactA.contactId, idempotencyKey: privacyKey,
    })).resolves.toEqual({ status: "conflict" });
    await expect(store.requestPrivacyJob(contextB, {
      jobType: "erasure", contactId: contactA.contactId, idempotencyKey: `privacy-substitution-${randomUUID()}`,
    })).resolves.toEqual({ status: "not_found" });
    const hidden = await tenantClient!.begin(async (sql) => {
      await sql`SELECT set_config('app.tenant_id', ${contextB.tenantId}, true)`;
      return sql<{ count: number }[]>`SELECT count(*)::int AS count FROM tenancy.privacy_jobs WHERE id = ${privacy.jobId}::uuid`;
    });
    expect(hidden[0]?.count).toBe(0);
  });
});
