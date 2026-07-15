import { randomUUID } from "node:crypto";
import { AiTextRuntime, type AiPublicResponse } from "@djay/ai-chat-runtime";
import { createTenantContext } from "@djay/tenancy";
import { runAiChatMerchantEmail } from "@djay/notifications";
import { afterAll, describe, expect, it } from "vitest";
import { AiChatRuntimeStore } from "./ai-chat-runtime-store";
import { AiChatStore } from "./ai-chat-store";
import { createDatabaseClient } from "./client";
import { TenantAiNotificationStore } from "./flowbot-notification-store";
import { AiChatNotificationWorkerStore } from "./flowbot-notification-store";
import { SharedDomainStore } from "./shared-domain-store";

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
  await runtimeClient?.end();
  await tenantClient?.end();
  await adminClient?.end();
  await workerClient?.end();
});

describe.runIf(enabled)("P5 AI Chat Basic restricted runtime", () => {
  it("pins approved knowledge, applies structured effects once, reconciles usage, and stops for takeover", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const context = createTenantContext({
      tenantId,
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: randomUUID(),
      role: "tenant_master_admin",
      requestId: "p5-ai-chat-runtime",
    });
    const subscriptionId = randomUUID();
    const snapshotId = randomUUID();
    const planVersionId = "62000000-0000-4000-8000-000000000003";
    const entitlements = {
      "ai.enabled": true,
      "sales_core.enabled": true,
      "knowledge.enabled": true,
      "lead_capture.enabled": true,
      "appointment_request.enabled": true,
      "sales_email_action.enabled": true,
      "human_handover.enabled": true,
      "ai.text": true,
      "channel.web": true,
      "channel.line": false,
      "channel.whatsapp": false,
      "channel.messenger": false,
      "branding.remove": false,
    };
    const limits = { deployments: 1, knowledge_documents: 10, seats: 5, storage_mb: 100 };
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND product_key = 'ai_chat' AND status <> 'cancelled'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status, period_start, period_end
      ) VALUES (
        ${subscriptionId}::uuid, ${tenantId}::uuid, 'ai_chat', ${planVersionId}::uuid,
        'active', now(), now() + interval '30 days'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'ai_chat',
        ${planVersionId}::uuid, 'active', 'active',
        ${adminClient!.json({
          tenantId, subscriptionId, productKey: "ai_chat", publicPlanKey: "ai_chat_basic",
          planVersionId, accessMode: "active", entitlements,
          allowances: { ai_response: 100 }, overageRatesMinor: { ai_response: null }, limits,
          resolvedAt: new Date().toISOString(),
        })}, digest(${snapshotId}, 'sha256')
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.quota_accounts (
        tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
        included_quantity, safety_cap_quantity
      ) VALUES (
        ${tenantId}::uuid, ${subscriptionId}::uuid, 'ai_chat', 'ai_response',
        now() - interval '1 minute', now() + interval '30 days', 100, 120
      )
    `;

    const shared = new SharedDomainStore(tenantClient!);
    const knowledge = await shared.createKnowledgeSource(context, {
      name: "Approved consultation facts",
      sourceKind: "text",
      content: "The discovery consultation is 30 minutes. Appointment times are requests until the merchant confirms them.",
    });
    const notificationKey = Buffer.alloc(32, 7);
    const notifications = new TenantAiNotificationStore(tenantClient!);
    const notification = await notifications.create(context, {
      name: "Sales team inbox", recipientEmail: "sales@example.test", envelopeKey: notificationKey,
    });
    expect(notification.status).toBe("created");
    if (notification.status !== "created") throw new Error("Expected AI notification profile.");

    const authoring = new AiChatStore(tenantClient!);
    const agent = await authoring.createAgent(context, {
      name: "Mali", businessName: "Acme Studio", defaultLanguage: "en",
    });
    expect(agent.status).toBe("created");
    if (agent.status !== "created") throw new Error("Expected AI agent.");
    const draft = await authoring.getDraft(context, agent.agentId);
    expect(draft).toBeTruthy();
    const updated = await authoring.updateDraft(context, agent.agentId, {
      revision: draft!.revision,
      definition: { ...(draft!.definition as object), notificationProfileId: notification.profileId },
      knowledgeRevisionIds: [knowledge.revisionId],
    });
    expect(updated.status).toBe("updated");
    const published = await authoring.publish(context, agent.agentId);
    expect(published.status).toBe("published");
    if (published.status !== "published") throw new Error("Expected published AI playbook.");
    const deployment = await authoring.createWebDeployment(context, agent.agentId, {
      name: "Main website", allowedOrigins: ["https://merchant.example"],
    });
    expect(deployment.status).toBe("created");
    if (deployment.status !== "created") throw new Error("Expected web deployment.");

    const repository = new AiChatRuntimeStore(runtimeClient!);
    await expect(repository.config(deployment.deploymentKey, "https://merchant.example"))
      .resolves.toMatchObject({ agentName: "Mali", defaultLanguage: "en", brandingRemoved: false });
    await expect(repository.config(deployment.deploymentKey, "https://evil.example")).resolves.toBeNull();
    const started = await repository.start({
      deploymentKey: deployment.deploymentKey, origin: "https://merchant.example", language: "en",
    });
    expect(started).toMatchObject({ greeting: expect.any(String), nextMessageSequence: 2 });
    if (!started) throw new Error("Expected AI session.");

    const replacement = await authoring.publish(context, agent.agentId);
    expect(replacement.status).toBe("published");
    let gatewayCalls = 0;
    const runtime = new AiTextRuntime(repository, {
      async generate(request) {
        gatewayCalls += 1;
        expect(request.systemPolicy).toContain("30 minutes");
        const citation = request.systemPolicy.match(/\[([0-9a-f-]{36}):([0-9a-f-]{36})\]/i);
        if (!citation) throw new Error("Expected pinned citation IDs.");
        const firstStart = new Date(Date.now() + 172_800_000).toISOString();
        const secondStart = new Date(Date.now() + 259_200_000).toISOString();
        return {
          output: {
            schemaVersion: "sales-core.v1", stage: "S8_APPOINTMENT", intent: "request_consultation",
            facts: [{
              type: "appointment_preference", value: "Two weekday options", source: "customer",
              status: "confirmed", evidence: "Customer requested a consultation", confidence: 1,
            }],
            knowledgeCitations: [{ sourceRevisionId: citation[1], chunkId: citation[2] }],
            responseGoal: "Record a qualified lead and consultation request",
            proposedActions: [
              { type: "lead.capture", name: "Ada Customer", email: "ada@example.test", need: "Conversion consultation" },
              { type: "sales_fact.record", factType: "appointment_preference", value: "Weekday afternoon" },
              { type: "appointment.request", timezone: "Asia/Bangkok", confirmationClaim: "pending_merchant_confirmation", options: [
                { startAt: firstStart, endAt: new Date(new Date(firstStart).getTime() + 1_800_000).toISOString() },
                { startAt: secondStart, endAt: new Date(new Date(secondStart).getTime() + 1_800_000).toISOString() },
              ] },
              { type: "merchant_email.send", templateKey: "ai_chat.lead_qualified" },
            ],
            handover: null,
            customerResponse: "I recorded your request with two options. The merchant still needs to confirm the appointment.",
            channelResponse: { format: "text", quickReplies: ["Ask another question"] },
          },
          nativeUsage: { inputUnits: 120, outputUnits: 45, cachedUnits: 10 },
        };
      },
    });
    const inputId = randomUUID();
    const publicResponse = await runtime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: started.sessionToken, origin: "https://merchant.example", inputId,
      message: "I am Ada. Email ada@example.test. Please request a weekday consultation.",
    });
    expect(publicResponse).toMatchObject({ status: "completed", inputId, nextTurnSequence: 2 });
    expect(JSON.stringify(publicResponse)).not.toMatch(/openai|anthropic|gemini|gpt|provider|model/i);
    await expect(runtime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: started.sessionToken, origin: "https://merchant.example", inputId,
      message: "I am Ada. Email ada@example.test. Please request a weekday consultation.",
    })).resolves.toEqual(publicResponse);
    expect(gatewayCalls).toBe(1);
    await expect(repository.begin({
      deploymentKey: deployment.deploymentKey,
      sessionToken: started.sessionToken, origin: "https://merchant.example", inputId,
      message: "Different payload with the same key",
    })).rejects.toThrow();

    const effects = await adminClient!<{
      leads: number; appointments: number; appointment_options: number; emails: number;
      settled: number; reserved: number; native_usage: number; session_playbook: string; current_playbook: string;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.leads lead WHERE lead.tenant_id = session.tenant_id AND lead.source = 'ai_chat_web') AS leads,
        (SELECT count(*)::int FROM tenancy.appointment_requests request WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id AND request.status = 'requested') AS appointments,
        (SELECT count(*)::int FROM tenancy.appointment_time_options option WHERE option.tenant_id = session.tenant_id AND option.appointment_request_id IN (
          SELECT id FROM tenancy.appointment_requests request WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id
        )) AS appointment_options,
        (SELECT count(*)::int FROM tenancy.outbox item WHERE item.tenant_id = session.tenant_id AND item.topic = 'ai_chat.merchant_email.requested') AS emails,
        account.settled_quantity::int AS settled, account.reserved_quantity::int AS reserved,
        (SELECT count(*)::int FROM operations.ai_native_usage usage WHERE usage.tenant_id = session.tenant_id) AS native_usage,
        session.playbook_version_id AS session_playbook,
        agent.current_published_playbook_version_id AS current_playbook
      FROM tenancy.ai_sessions session
      JOIN tenancy.ai_agents agent ON agent.tenant_id = session.tenant_id AND agent.id = session.agent_id
      JOIN tenancy.quota_accounts account ON account.tenant_id = session.tenant_id AND account.subscription_id = ${subscriptionId}::uuid
      WHERE session.id = ${started.sessionId}::uuid
    `;
    expect(effects[0]).toMatchObject({
      leads: 1, appointments: 1, appointment_options: 2, emails: 1,
      settled: 1, reserved: 0, native_usage: 1, session_playbook: published.playbookVersionId,
      current_playbook: replacement.status === "published" ? replacement.playbookVersionId : "missing",
    });
    const sentMessages: { to: string; subject: string }[] = [];
    await expect(runAiChatMerchantEmail(
      new AiChatNotificationWorkerStore(workerClient!),
      { async send(message) { sentMessages.push({ to: message.to, subject: message.subject }); } },
      notificationKey,
    )).resolves.toMatchObject({ status: "sent" });
    expect(sentMessages).toEqual([{ to: "sales@example.test", subject: "Qualified website lead from DJAY Bot" }]);
    const delivered = await adminClient!<{ status: string }[]>`
      SELECT status FROM tenancy.outbox
      WHERE tenant_id = ${tenantId}::uuid AND topic = 'ai_chat.merchant_email.requested'
    `;
    expect(delivered).toEqual([{ status: "sent" }]);

    const takeoverSession = await repository.start({
      deploymentKey: deployment.deploymentKey, origin: "https://merchant.example", language: "en",
    });
    if (!takeoverSession) throw new Error("Expected takeover test session.");
    const takeoverInputId = randomUUID();
    const began = await repository.begin({
      deploymentKey: deployment.deploymentKey,
      sessionToken: takeoverSession.sessionToken, origin: "https://merchant.example",
      inputId: takeoverInputId, message: "I need a person",
    });
    await expect(shared.takeOverConversation(context, began.conversationId)).resolves.toMatchObject({ status: "accepted" });
    const suppressed = await repository.commit({
      deploymentKey: deployment.deploymentKey,
      sessionToken: takeoverSession.sessionToken, origin: "https://merchant.example", inputId: takeoverInputId,
      output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "request_human", facts: [],
        knowledgeCitations: [], responseGoal: "offer help", proposedActions: [], handover: null,
        customerResponse: "This reply must not be emitted.", channelResponse: { format: "text", quickReplies: [] },
      },
      publicResponse: {
        status: "completed", inputId: takeoverInputId, text: "This reply must not be emitted.",
        quickReplies: [], nextTurnSequence: 2,
      } satisfies AiPublicResponse,
      nativeUsage: { inputUnits: 10, outputUnits: 5 },
    });
    expect(suppressed).toEqual({ status: "handover" });
    const takeoverState = await adminClient!<{
      ai_messages: number; released_events: number; reserved: number; settled: number; native_usage: number;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.messages message WHERE message.tenant_id = session.tenant_id
          AND message.conversation_id = session.conversation_id AND message.actor_type = 'ai' AND message.sequence > 1) AS ai_messages,
        (SELECT count(*)::int FROM tenancy.usage_events event WHERE event.tenant_id = session.tenant_id
          AND event.operation_id = turn.id::text AND event.event_type = 'released') AS released_events,
        account.reserved_quantity::int AS reserved, account.settled_quantity::int AS settled,
        (SELECT count(*)::int FROM operations.ai_native_usage usage WHERE usage.tenant_id = session.tenant_id AND usage.turn_id = turn.id) AS native_usage
      FROM tenancy.ai_sessions session
      JOIN tenancy.ai_turns turn ON turn.tenant_id = session.tenant_id AND turn.session_id = session.id
      JOIN tenancy.quota_accounts account ON account.tenant_id = session.tenant_id AND account.subscription_id = ${subscriptionId}::uuid
      WHERE session.id = ${takeoverSession.sessionId}::uuid
    `;
    expect(takeoverState[0]).toEqual({ ai_messages: 0, released_events: 1, reserved: 0, settled: 1, native_usage: 0 });
    await expect(repository.sync({
      deploymentKey: deployment.deploymentKey, sessionToken: takeoverSession.sessionToken,
      origin: "https://evil.example", afterSequence: 0,
    })).resolves.toBeNull();
  });
});
