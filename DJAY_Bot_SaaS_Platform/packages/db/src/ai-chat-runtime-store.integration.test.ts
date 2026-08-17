import { randomUUID } from "node:crypto";
import { AiTextRuntime, type AiPublicResponse } from "@djay/ai-chat-runtime";
import { ProviderGatewayError } from "@djay/provider-gateway";
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
    const limits = { active_bots: 1, deployments: 1, knowledge_documents: 10, seats: 5, storage_mb: 100 };
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
    if (knowledge.status !== "created") throw new Error("Expected knowledge source.");
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
    await expect(authoring.createAgent(context, {
      name: "Second agent", businessName: "Acme Studio", defaultLanguage: "th",
    })).resolves.toEqual({ status: "limit_reached" });
    await expect(tenantClient!.begin(async (sql) => {
      await sql`
        SELECT
          set_config('app.tenant_id', ${context.tenantId}, true),
          set_config('app.user_id', ${context.userId}, true),
          set_config('app.membership_id', ${context.membershipId}, true),
          set_config('app.session_id', ${context.sessionId}, true),
          set_config('app.request_id', 'p5-ai-chat-direct-limit-bypass', true)
      `;
      await sql`
        INSERT INTO tenancy.ai_agents (
          id, tenant_id, name, product_family, default_language, created_by_membership_id
        ) VALUES (
          ${randomUUID()}::uuid, ${context.tenantId}::uuid, 'Direct bypass', 'text', 'en',
          ${context.membershipId}::uuid
        )
      `;
    })).rejects.toThrow(/ai_text_active_bot_limit_reached/);
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
    expect(await authoring.listDeployments(context, agent.agentId)).toMatchObject([
      { id: deployment.deploymentId, trafficStatus: "inactive", livePlaybookVersionId: null, liveAt: null },
    ]);
    await expect(repository.config(deployment.deploymentKey, "https://merchant.example")).resolves.toBeNull();
    await expect(authoring.changeDeploymentTraffic(context, deployment.deploymentId, "go_live"))
      .resolves.toEqual({ status: "verification_required" });
    const otherTenantContext = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: "ai-cross-tenant",
    });
    const otherSubscriptionId = randomUUID();
    const otherSnapshotId = randomUUID();
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${otherTenantContext.tenantId}::uuid
        AND product_key = 'ai_chat' AND status <> 'cancelled'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status, period_start, period_end
      ) VALUES (
        ${otherSubscriptionId}::uuid, ${otherTenantContext.tenantId}::uuid, 'ai_chat',
        ${planVersionId}::uuid, 'active', now(), now() + interval '30 days'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${otherSnapshotId}::uuid, ${otherTenantContext.tenantId}::uuid,
        ${otherSubscriptionId}::uuid, 'ai_chat', ${planVersionId}::uuid, 'active', 'active',
        ${adminClient!.json({ entitlements: { "knowledge.enabled": true }, limits })},
        digest(${otherSnapshotId}, 'sha256')
      )
    `;
    const crossTenantKnowledge = await new SharedDomainStore(tenantClient!).createKnowledgeSource(otherTenantContext, {
      name: "Other tenant private knowledge",
      sourceKind: "text",
      content: "CROSS_TENANT_KNOWLEDGE_CANARY must never enter Acme Studio retrieval.",
    });
    expect(crossTenantKnowledge.status).toBe("created");
    await expect(authoring.changeDeploymentTraffic(otherTenantContext, deployment.deploymentId, "go_live"))
      .resolves.toEqual({ status: "not_found" });
    await expect(authoring.requestInstallCheck(context, deployment.deploymentId, "https://merchant.example"))
      .resolves.toMatchObject({ status: "requested" });
    await expect(repository.reportInstall(deployment.deploymentKey, "https://evil.example")).resolves.toBe(0);
    await expect(repository.reportInstall(deployment.deploymentKey, "https://merchant.example")).resolves.toBe(1);
    expect(await authoring.listInstallChecks(context, deployment.deploymentId)).toMatchObject([
      { deploymentId: deployment.deploymentId, targetOrigin: "https://merchant.example", status: "verified" },
    ]);
    await expect(authoring.changeDeploymentTraffic(context, deployment.deploymentId, "go_live"))
      .resolves.toEqual({ status: "updated", trafficStatus: "live" });
    expect(await authoring.listDeployments(context, agent.agentId)).toMatchObject([
      { id: deployment.deploymentId, trafficStatus: "live", livePlaybookVersionId: published.playbookVersionId },
    ]);
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
    expect(await authoring.listDeployments(context, agent.agentId)).toMatchObject([
      { id: deployment.deploymentId, livePlaybookVersionId: published.playbookVersionId },
    ]);
    if (replacement.status !== "published") throw new Error("Expected replacement AI playbook.");
    await expect(authoring.changeDeploymentTraffic(context, deployment.deploymentId, "go_live"))
      .resolves.toEqual({ status: "updated", trafficStatus: "live" });
    expect(await authoring.listDeployments(context, agent.agentId)).toMatchObject([
      { id: deployment.deploymentId, livePlaybookVersionId: replacement.playbookVersionId },
    ]);
    const history = await authoring.listVersions(context, agent.agentId);
    expect(history).toHaveLength(2);
    expect(history[0]?.knowledgeCount).toBe(1);
    const restored = await authoring.rollback(context, agent.agentId, published.playbookVersionId);
    expect(restored.status).toBe("published");
    const restoredHistory = await authoring.listVersions(context, agent.agentId);
    expect(restoredHistory).toHaveLength(3);
    expect(restoredHistory[0]).toMatchObject({ sourceVersionId: published.playbookVersionId, knowledgeCount: 1 });
    let gatewayCalls = 0;
    const runtime = new AiTextRuntime(repository, {
      async generate(request) {
        gatewayCalls += 1;
        expect(request.systemPolicy).toContain("30 minutes");
        expect(request.systemPolicy).not.toContain("CROSS_TENANT_KNOWLEDGE_CANARY");
        const citation = request.systemPolicy.match(
          /"sourceRevisionId"\s*:\s*"([0-9a-f-]{36})"\s*,\s*"chunkId"\s*:\s*"([0-9a-f-]{36})"/i,
        );
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
    const structuredEvidence = await adminClient!<{
      confidence: number; safetyState: string; safetyReasonCount: number; actionTypes: string[];
    }[]>`
      SELECT (structured_output_json->>'confidence')::numeric::float8 AS confidence,
        structured_output_json->'safety'->>'state' AS "safetyState",
        jsonb_array_length(structured_output_json->'safety'->'reasonCodes')::int AS "safetyReasonCount",
        ARRAY(SELECT action->>'type' FROM jsonb_array_elements(structured_output_json->'proposedActions') action) AS "actionTypes"
      FROM tenancy.ai_turns
      WHERE tenant_id = ${tenantId}::uuid AND input_id = ${inputId}::uuid
    `;
    expect(structuredEvidence).toEqual([{
      confidence: 0.9,
      safetyState: "allowed",
      safetyReasonCount: 0,
      actionTypes: ["lead.capture", "sales_fact.record", "appointment.request", "merchant_email.send"],
    }]);
    await expect(repository.begin({
      deploymentKey: deployment.deploymentKey,
      sessionToken: started.sessionToken, origin: "https://merchant.example", inputId,
      message: "Different payload with the same key",
    })).rejects.toThrow();

    const effects = await adminClient!<{
      leads: number; appointments: number; confirmedAppointments: number; appointment_options: number; emails: number;
      successfulActions: number;
      settled: number; reserved: number; native_usage: number; fundingIncluded: number;
      session_playbook: string; current_playbook: string;
    }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.leads lead WHERE lead.tenant_id = session.tenant_id AND lead.source = 'ai_chat_web') AS leads,
        (SELECT count(*)::int FROM tenancy.appointment_requests request WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id AND request.status = 'requested') AS appointments,
        (SELECT count(*)::int FROM tenancy.appointment_requests request WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id AND request.status = 'confirmed') AS "confirmedAppointments",
        (SELECT count(*)::int FROM tenancy.appointment_time_options option WHERE option.tenant_id = session.tenant_id AND option.appointment_request_id IN (
          SELECT id FROM tenancy.appointment_requests request WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id
        )) AS appointment_options,
        (SELECT count(*)::int FROM tenancy.outbox item WHERE item.tenant_id = session.tenant_id AND item.topic = 'ai_chat.merchant_email.requested') AS emails,
        (SELECT count(*)::int FROM tenancy.action_results result
          JOIN tenancy.action_requests request ON request.tenant_id = result.tenant_id AND request.id = result.action_request_id
          WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id AND result.success) AS "successfulActions",
        account.settled_quantity::int AS settled, account.reserved_quantity::int AS reserved,
        (SELECT (reservation.funding_json->>'included')::numeric::int
          FROM tenancy.ai_turns turn
          JOIN tenancy.usage_reservations reservation
            ON reservation.tenant_id = turn.tenant_id AND reservation.id = turn.usage_reservation_id
          WHERE turn.tenant_id = session.tenant_id AND turn.session_id = session.id
          ORDER BY turn.turn_sequence LIMIT 1) AS "fundingIncluded",
        (SELECT count(*)::int FROM operations.ai_native_usage usage WHERE usage.tenant_id = session.tenant_id) AS native_usage,
        session.playbook_version_id AS session_playbook,
        agent.current_published_playbook_version_id AS current_playbook
      FROM tenancy.ai_sessions session
      JOIN tenancy.ai_agents agent ON agent.tenant_id = session.tenant_id AND agent.id = session.agent_id
      JOIN tenancy.quota_accounts account ON account.tenant_id = session.tenant_id AND account.subscription_id = ${subscriptionId}::uuid
      WHERE session.id = ${started.sessionId}::uuid
    `;
    expect(effects[0]).toMatchObject({
      leads: 1, appointments: 1, confirmedAppointments: 0, appointment_options: 2, emails: 1, successfulActions: 4,
      settled: 1, reserved: 0, native_usage: 1, fundingIncluded: 1,
      session_playbook: published.playbookVersionId,
      current_playbook: restored.status === "published" ? restored.playbookVersionId : "missing",
    });

    const fallbackSession = await repository.start({
      deploymentKey: deployment.deploymentKey, origin: "https://merchant.example", language: "en",
    });
    if (!fallbackSession) throw new Error("Expected safe-fallback test session.");
    let malformedCalls = 0;
    const fallbackRuntime = new AiTextRuntime(repository, {
      async generate() {
        malformedCalls += 1;
        return { output: { malformed: true }, nativeUsage: { inputUnits: 7, outputUnits: 3 } };
      },
    });
    const fallbackInputId = randomUUID();
    const fallbackResponse = await fallbackRuntime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: fallbackSession.sessionToken,
      origin: "https://merchant.example",
      inputId: fallbackInputId,
      message: "Give me an answer even when the provider output is malformed.",
    });
    expect(fallbackResponse).toMatchObject({
      status: "completed",
      inputId: fallbackInputId,
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    await expect(fallbackRuntime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: fallbackSession.sessionToken,
      origin: "https://merchant.example",
      inputId: fallbackInputId,
      message: "Give me an answer even when the provider output is malformed.",
    })).resolves.toEqual(fallbackResponse);
    expect(malformedCalls).toBe(2);
    const fallbackEvidence = await adminClient!<{
      settled: number; turnStatus: string; intent: string; inputUnits: number; outputUnits: number;
    }[]>`
      SELECT account.settled_quantity::int AS settled, turn.status AS "turnStatus",
        turn.structured_output_json->>'intent' AS intent,
        usage.input_units::int AS "inputUnits", usage.output_units::int AS "outputUnits"
      FROM tenancy.ai_sessions session
      JOIN tenancy.ai_turns turn ON turn.tenant_id = session.tenant_id AND turn.session_id = session.id
      JOIN operations.ai_native_usage usage ON usage.tenant_id = turn.tenant_id AND usage.turn_id = turn.id
      JOIN tenancy.quota_accounts account ON account.tenant_id = session.tenant_id
        AND account.subscription_id = ${subscriptionId}::uuid
      WHERE session.id = ${fallbackSession.sessionId}::uuid
    `;
    expect(fallbackEvidence).toEqual([{
      settled: 2,
      turnStatus: "completed",
      intent: "safe_fallback.structured_output_invalid",
      inputUnits: 14,
      outputUnits: 6,
    }]);

    const lengthSession = await repository.start({
      deploymentKey: deployment.deploymentKey, origin: "https://merchant.example", language: "en",
    });
    if (!lengthSession) throw new Error("Expected length-fallback test session.");
    let lengthCalls = 0;
    const lengthRuntime = new AiTextRuntime(repository, {
      async generate() {
        lengthCalls += 1;
        return { output: {
          schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "discover_need", facts: [],
          knowledgeCitations: [], responseGoal: "understand the need", proposedActions: [], handover: null,
          customerResponse: Array.from({ length: 201 }, () => "word").join(" "),
          channelResponse: { format: "text", quickReplies: [] },
        }, nativeUsage: { inputUnits: 9, outputUnits: 4 } };
      },
    });
    const lengthInputId = randomUUID();
    const lengthResponse = await lengthRuntime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: lengthSession.sessionToken,
      origin: "https://merchant.example",
      inputId: lengthInputId,
      message: "Please answer concisely.",
    });
    expect(lengthResponse).toMatchObject({
      status: "completed",
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    await expect(lengthRuntime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: lengthSession.sessionToken,
      origin: "https://merchant.example",
      inputId: lengthInputId,
      message: "Please answer concisely.",
    })).resolves.toEqual(lengthResponse);
    expect(lengthCalls).toBe(2);
    const lengthEvidence = await adminClient!<{
      settled: number; intent: string; wordCount: number; inputUnits: number; outputUnits: number;
    }[]>`
      SELECT account.settled_quantity::int AS settled,
        turn.structured_output_json->>'intent' AS intent,
        array_length(regexp_split_to_array(turn.structured_output_json->>'customerResponse', '[[:space:]]+'), 1)::int AS "wordCount",
        usage.input_units::int AS "inputUnits", usage.output_units::int AS "outputUnits"
      FROM tenancy.ai_sessions session
      JOIN tenancy.ai_turns turn ON turn.tenant_id = session.tenant_id AND turn.session_id = session.id
      JOIN operations.ai_native_usage usage ON usage.tenant_id = turn.tenant_id AND usage.turn_id = turn.id
      JOIN tenancy.quota_accounts account ON account.tenant_id = session.tenant_id
        AND account.subscription_id = ${subscriptionId}::uuid
      WHERE session.id = ${lengthSession.sessionId}::uuid
    `;
    expect(lengthEvidence).toEqual([{
      settled: 3,
      intent: "safe_fallback.structured_output_invalid",
      wordCount: 15,
      inputUnits: 18,
      outputUnits: 8,
    }]);

    const providerStateSession = await repository.start({
      deploymentKey: deployment.deploymentKey, origin: "https://merchant.example", language: "en",
    });
    if (!providerStateSession) throw new Error("Expected provider-state test session.");
    let providerStateCalls = 0;
    const providerStateRuntime = new AiTextRuntime(repository, {
      async generate() { providerStateCalls += 1; throw new ProviderGatewayError("provider_quota_exhausted"); },
    });
    const providerStateInputId = randomUUID();
    const providerStateResponse = await providerStateRuntime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: providerStateSession.sessionToken,
      origin: "https://merchant.example",
      inputId: providerStateInputId,
      message: "Can you still answer safely?",
    });
    expect(providerStateResponse).toMatchObject({
      status: "completed",
      text: "I could not confirm that from approved information. I can connect you with a person.",
      actions: [],
    });
    await expect(providerStateRuntime.turn({
      deploymentKey: deployment.deploymentKey,
      sessionToken: providerStateSession.sessionToken,
      origin: "https://merchant.example",
      inputId: providerStateInputId,
      message: "Can you still answer safely?",
    })).resolves.toEqual(providerStateResponse);
    expect(providerStateCalls).toBe(1);
    const providerStateEvidence = await adminClient!<{
      settled: number; intent: string; inputUnits: number; outputUnits: number;
    }[]>`
      SELECT account.settled_quantity::int AS settled,
        turn.structured_output_json->>'intent' AS intent,
        usage.input_units::int AS "inputUnits", usage.output_units::int AS "outputUnits"
      FROM tenancy.ai_sessions session
      JOIN tenancy.ai_turns turn ON turn.tenant_id = session.tenant_id AND turn.session_id = session.id
      JOIN operations.ai_native_usage usage ON usage.tenant_id = turn.tenant_id AND usage.turn_id = turn.id
      JOIN tenancy.quota_accounts account ON account.tenant_id = session.tenant_id
        AND account.subscription_id = ${subscriptionId}::uuid
      WHERE session.id = ${providerStateSession.sessionId}::uuid
    `;
    expect(providerStateEvidence).toEqual([{
      settled: 4,
      intent: "safe_fallback.provider_quota_exhausted",
      inputUnits: 0,
      outputUnits: 0,
    }]);
    const sentMessages: { to: string; subject: string }[] = [];
    await expect(runAiChatMerchantEmail(
      new AiChatNotificationWorkerStore(workerClient!),
      { async send(message) { sentMessages.push({ to: message.to, subject: message.subject }); } },
      notificationKey,
    )).resolves.toMatchObject({ status: "sent" });
    expect(sentMessages).toEqual([{ to: "sales@example.test", subject: "ผู้สนใจที่ผ่านการคัดกรองจาก DJAY Bot" }]);
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
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "request_human",
        confidence: 0.8, safety: { state: "allowed", reasonCodes: [] }, facts: [],
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
    await expect(shared.appendMessage(context, began.conversationId, {
      actorType: "human", direction: "outbound", text: "I can help now.",
    })).resolves.toMatchObject({ status: "created" });
    await expect(shared.releaseConversation(
      { ...context, requestId: "ai-safe-release" }, began.conversationId,
    )).resolves.toEqual({ status: "released", automationMode: "ai_text" });
    const resumedInputId = randomUUID();
    const resumed = await repository.begin({
      deploymentKey: deployment.deploymentKey,
      sessionToken: takeoverSession.sessionToken, origin: "https://merchant.example",
      inputId: resumedInputId, message: "Can the bot help again?",
    });
    expect(resumed.recentMessages).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ content: "I can help now." }),
    ]));
    await expect(repository.commit({
      deploymentKey: deployment.deploymentKey,
      sessionToken: takeoverSession.sessionToken, origin: "https://merchant.example",
      inputId: resumedInputId,
      output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "continue_support",
        confidence: 0.8, safety: { state: "allowed", reasonCodes: [] }, facts: [],
        knowledgeCitations: [], responseGoal: "resume safely", proposedActions: [], handover: null,
        customerResponse: "Yes, I can help again.", channelResponse: { format: "text", quickReplies: [] },
      },
      publicResponse: {
        status: "completed", inputId: resumedInputId, text: "Yes, I can help again.",
        quickReplies: [], nextTurnSequence: 3,
      } satisfies AiPublicResponse,
      nativeUsage: { inputUnits: 8, outputUnits: 5 },
    })).resolves.toMatchObject({ status: "completed", text: "Yes, I can help again." });
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
      WHERE session.id = ${takeoverSession.sessionId}::uuid AND turn.input_id = ${takeoverInputId}::uuid
    `;
    expect(takeoverState[0]).toEqual({ ai_messages: 1, released_events: 1, reserved: 0, settled: 5, native_usage: 0 });
    await adminClient!`UPDATE tenancy.knowledge_sources SET status = 'archived', updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${knowledge.sourceId}::uuid`;
    const inactiveRevisionId = randomUUID();
    await adminClient!`INSERT INTO tenancy.knowledge_source_revisions
      (id, tenant_id, source_id, version, content_text, checksum, status, created_by_membership_id)
      VALUES (${inactiveRevisionId}::uuid, ${tenantId}::uuid, ${knowledge.sourceId}::uuid, 2,
        'Archived content must not become published.', public.digest('Archived content must not become published.', 'sha256'),
        'ready', ${context.membershipId}::uuid)`;
    await expect(adminClient!`INSERT INTO tenancy.ai_playbook_knowledge
      (tenant_id, agent_id, playbook_version_id, source_revision_id)
      VALUES (${tenantId}::uuid, ${agent.agentId}::uuid, ${published.playbookVersionId}::uuid, ${inactiveRevisionId}::uuid)`)
      .rejects.toThrow("knowledge_revision_not_publishable");
    await expect(authoring.publish(context, agent.agentId)).resolves.toEqual({
      status: "validation_failed", issues: ["knowledge_revision_not_available"],
    });
    await expect(authoring.getTestContext(context, agent.agentId)).resolves.toMatchObject({ knowledgeChunks: [] });
    const inactiveKnowledgeSession = await repository.start({
      deploymentKey: deployment.deploymentKey, origin: "https://merchant.example", language: "en",
    });
    if (!inactiveKnowledgeSession) throw new Error("Expected active-source retrieval test session.");
    const inactiveKnowledgeInputId = randomUUID();
    const inactiveKnowledgeTurn = await repository.begin({
      deploymentKey: deployment.deploymentKey, sessionToken: inactiveKnowledgeSession.sessionToken,
      origin: "https://merchant.example", inputId: inactiveKnowledgeInputId, message: "Use only active knowledge.",
    });
    expect(inactiveKnowledgeTurn.knowledgeChunks).toEqual([]);
    await expect(repository.commit({ deploymentKey: deployment.deploymentKey, sessionToken: inactiveKnowledgeSession.sessionToken,
      origin: "https://merchant.example", inputId: inactiveKnowledgeInputId, output: {
        schemaVersion: "sales-core.v1", stage: "S2_DISCOVERY", intent: "active_knowledge_check",
        confidence: 0.8, safety: { state: "allowed", reasonCodes: [] }, facts: [], knowledgeCitations: [],
        responseGoal: "confirm active knowledge boundary", proposedActions: [], handover: null,
        customerResponse: "No active source supports that answer.", channelResponse: { format: "text", quickReplies: [] },
      }, publicResponse: { status: "completed", inputId: inactiveKnowledgeInputId,
        text: "No active source supports that answer.", quickReplies: [], nextTurnSequence: 2 },
      nativeUsage: { inputUnits: 1, outputUnits: 1 } })).resolves.toMatchObject({ status: "completed" });
    const retrievalFunctions = await adminClient!<{ name: string; definition: string }[]>`
      SELECT procedure.proname AS name, pg_get_functiondef(procedure.oid) AS definition
      FROM pg_proc procedure JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'tenancy' AND procedure.proname IN ('begin_ai_turn', 'begin_ai_social_turn')
      ORDER BY procedure.proname`;
    expect(retrievalFunctions.map((item) => item.name)).toEqual(["begin_ai_social_turn", "begin_ai_turn"]);
    for (const item of retrievalFunctions) {
      expect(item.definition).toContain("revision.status = 'ready'");
      expect(item.definition).toContain("source.status = 'active'");
    }
    await expect(repository.sync({
      deploymentKey: deployment.deploymentKey, sessionToken: takeoverSession.sessionToken,
      origin: "https://evil.example", afterSequence: 0,
    })).resolves.toBeNull();
    await expect(authoring.changeDeploymentTraffic(context, deployment.deploymentId, "stop"))
      .resolves.toEqual({ status: "updated", trafficStatus: "inactive" });
    await expect(repository.config(deployment.deploymentKey, "https://merchant.example")).resolves.toBeNull();
    const trafficAudit = await adminClient!<{ action: string }[]>`
      SELECT action FROM tenancy.audit_logs
      WHERE tenant_id = ${tenantId}::uuid AND target_id = ${deployment.deploymentId}
        AND action IN ('ai_chat.deployment.go_live', 'ai_chat.deployment.stop_traffic')
      ORDER BY created_at
    `;
    expect(trafficAudit).toEqual([
      { action: "ai_chat.deployment.go_live" },
      { action: "ai_chat.deployment.go_live" },
      { action: "ai_chat.deployment.stop_traffic" },
    ]);
  });
});
