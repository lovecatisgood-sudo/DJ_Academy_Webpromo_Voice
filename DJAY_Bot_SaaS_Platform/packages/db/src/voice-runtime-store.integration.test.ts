import { randomUUID } from "node:crypto";
import { hashOpaqueToken } from "@djay/auth";
import { createTenantContext } from "@djay/tenancy";
import { voiceSessionGrantSchema } from "@djay/voice-runtime";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { VoiceRuntimeStore } from "./voice-runtime-store";
import { VoiceReaperStore } from "./voice-operations-store";
import { SharedDomainStore } from "./shared-domain-store";

const voiceUrl = process.env.VOICE_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const enabled = Boolean(voiceUrl && adminUrl && workerUrl && tenantUrl);
const voiceClient = enabled ? createDatabaseClient(voiceUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;

afterAll(async () => {
  await voiceClient?.end();
  await adminClient?.end();
  await workerClient?.end();
  await tenantClient?.end();
});

describe.runIf(enabled)("P7 Voice Basic restricted session authority", () => {
  it("issues opaque Gen1 grants, reserves atomically, reconnects, and settles exactly once", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const membershipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
    const subscriptionId = randomUUID();
    const snapshotId = randomUUID();
    const quotaId = randomUUID();
    const deploymentId = randomUUID();
    const agentId = randomUUID();
    const playbookVersionId = randomUUID();
    const planVersionId = "62000000-0000-4000-8000-000000000005";
    const deploymentKey = `djay_voice_deploy_${randomUUID().replaceAll("-", "")}`;
    const resolved = {
      tenantId, subscriptionId, productKey: "voice", publicPlanKey: "voice_basic_gen1",
      planVersionId, accessMode: "active",
      entitlements: {
        "voice.enabled": true,
        "voice.capability_profile": "voice_gen1",
        "voice.public_label": "First-Generation Voice Engine",
        "sales_core.enabled": true,
        "lead_capture.enabled": true,
        "appointment_request.enabled": true,
        "human_handover.enabled": true,
      },
      allowances: { voice_minute: 100 }, overageRatesMinor: { voice_minute: null },
      limits: { concurrent_calls: 1, phone_numbers: 0, storage_mb: 100, retention_days: 30 },
      resolvedAt: new Date().toISOString(),
    };
    await adminClient!`
      UPDATE platform.voice_runtime_controls
      SET mode = 'paused', reason_code = 'integration_test_pause', version = version + 1, changed_at = now()
      WHERE singleton = true
    `;
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND product_key = 'voice' AND status <> 'cancelled'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status, period_start, period_end
      ) VALUES (
        ${subscriptionId}::uuid, ${tenantId}::uuid, 'voice', ${planVersionId}::uuid,
        'active', now() - interval '1 minute', now() + interval '30 days'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'voice',
        ${planVersionId}::uuid, 'active', 'active', ${adminClient!.json(resolved)}, digest(${snapshotId}, 'sha256')
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.quota_accounts (
        id, tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
        included_quantity, safety_cap_quantity
      ) VALUES (
        ${quotaId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'voice', 'voice_minute',
        now() - interval '1 minute', now() + interval '30 days', 100, 10
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.ai_agents (
        id, tenant_id, name, status, default_language, created_by_membership_id
      ) VALUES (
        ${agentId}::uuid, ${tenantId}::uuid, 'Mali', 'active', 'en', ${membershipId}::uuid
      )
    `;
    const playbook = { schemaVersion: 1, playbookVersionId };
    await adminClient!`
      INSERT INTO tenancy.ai_playbook_versions (
        id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256, published_by_membership_id
      ) VALUES (
        ${playbookVersionId}::uuid, ${tenantId}::uuid, ${agentId}::uuid, 1, 'published',
        ${adminClient!.json(playbook)}, digest(${JSON.stringify(playbook)}, 'sha256'), ${membershipId}::uuid
      )
    `;
    await adminClient!`
      UPDATE tenancy.ai_agents SET current_published_playbook_version_id = ${playbookVersionId}::uuid
      WHERE tenant_id = ${tenantId}::uuid AND id = ${agentId}::uuid
    `;
    await adminClient!`
      INSERT INTO tenancy.voice_deployments (
        id, tenant_id, agent_id, name, capability_profile, deployment_key_hash, key_prefix, allowed_origins,
        default_locale, greeting_th, greeting_en, automated_disclosure_th,
        automated_disclosure_en, max_call_seconds, reconnect_window_seconds,
        created_by_membership_id
      ) VALUES (
        ${deploymentId}::uuid, ${tenantId}::uuid, ${agentId}::uuid, 'Main browser voice', 'voice_gen1',
        ${hashOpaqueToken(deploymentKey)}, ${deploymentKey.slice(0, 20)}, ARRAY['https://merchant.example'],
        'en', 'สวัสดีครับ', 'Hello, how can I help?',
        'นี่คือผู้ช่วยเสียงอัตโนมัติของเรา', 'This is our automated voice assistant.',
        90, 30, ${membershipId}::uuid
      )
    `;
    await expect(adminClient!`
      SELECT * FROM tenancy.issue_voice_basic_grant(
        ${hashOpaqueToken(deploymentKey)}, ${hashOpaqueToken("djay_voice_grant_admin_must_not_issue_000000000000")},
        'https://merchant.example', ${randomUUID()}::uuid, ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        now() + interval '1 minute', 'en'
      )
    `).rejects.toThrow(/voice_runtime_role_required/);

    const runtime = new VoiceRuntimeStore(voiceClient!);
    await expect(runtime.issue({
      deploymentKey, origin: "https://merchant.example", locale: "en", expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_runtime_not_accepting_new_sessions/);
    await adminClient!`
      UPDATE platform.voice_runtime_controls
      SET mode = 'running', reason_code = 'integration_test_resume', version = version + 1, changed_at = now()
      WHERE singleton = true
    `;
    await expect(runtime.issue({
      deploymentKey, origin: "https://evil.example", locale: "en", expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow();
    await expect(runtime.issue({
      deploymentKey: `${deploymentKey}_wrong`, origin: "https://merchant.example", locale: "en", expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow();

    const issued = await runtime.issue({
      deploymentKey, origin: "https://merchant.example", locale: "en", expiresAt: new Date(Date.now() + 60_000),
    });
    const publicGrant = voiceSessionGrantSchema.parse({
      sessionId: issued.sessionId, sessionGrant: issued.sessionGrant,
      gatewayUrl: "wss://voice.example.test/v1/connect", protocolVersion: "djay.voice.v1",
      capabilityProfile: issued.capabilityProfile, publicLabel: issued.publicLabel,
      expiresAt: issued.expiresAt, maxCallSeconds: issued.maxCallSeconds, locale: issued.locale,
      greeting: issued.greeting,
      reconnectPolicy: { maxAttempts: 3, backoffMs: 500, resumeWindowSeconds: issued.reconnectWindowSeconds },
      automatedAgentDisclosure: { required: true, text: issued.automatedDisclosure },
      recording: { enabled: false, disclosure: null },
    });
    expect(JSON.stringify(publicGrant)).not.toMatch(/openai|anthropic|gemini|gpt|provider|model|vendor|cost/i);
    const stored = await adminClient!<{ grantPlaintextStored: boolean; profile: string; label: string }[]>`
      SELECT encode(grant_hash, 'hex') = ${issued.sessionGrant} AS "grantPlaintextStored",
             capability_profile AS profile, public_label AS label
      FROM tenancy.voice_sessions WHERE id = ${issued.sessionId}::uuid
    `;
    expect(stored[0]).toEqual({ grantPlaintextStored: false, profile: "voice_gen1", label: "First-Generation Voice Engine" });

    const firstConnectionId = randomUUID();
    const authorized = await runtime.authorize({
      sessionGrant: issued.sessionGrant, sessionId: issued.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: firstConnectionId,
    });
    expect(authorized).toMatchObject({ sessionId: issued.sessionId, capabilityProfile: "voice_gen1", replayed: false });
    await expect(runtime.authorize({
      sessionGrant: issued.sessionGrant, sessionId: issued.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: firstConnectionId,
    })).resolves.toMatchObject({ replayed: true });
    await expect(runtime.mediaContext(issued.sessionId, firstConnectionId)).resolves.toEqual({
      greeting: "Hello, how can I help?", automatedDisclosure: "This is our automated voice assistant.", agentName: "Mali",
    });
    const inputId = randomUUID(); const firstStart = new Date(Date.now() + 86_400_000).toISOString();
    const secondStart = new Date(Date.now() + 90_000_000).toISOString();
    const turnContext = await runtime.beginTurn({
      sessionId: issued.sessionId, connectionId: firstConnectionId, inputId,
      message: "I am Alex and alex@example.com. Can I request a consultation tomorrow?",
    });
    expect(turnContext).toMatchObject({ sessionId: issued.sessionId, language: "en", turnSequence: 1 });
    const turnOutput = {
      schemaVersion: "sales-core.v1" as const, stage: "S8_APPOINTMENT" as const,
      intent: "appointment_request", facts: [], knowledgeCitations: [],
      responseGoal: "Record a lead and pending appointment request",
      proposedActions: [
        { type: "lead.capture" as const, name: "Alex", email: "alex@example.com", need: "Consultation" },
        { type: "appointment.request" as const, timezone: "Asia/Bangkok", confirmationClaim: "pending_merchant_confirmation" as const,
          options: [
            { startAt: firstStart, endAt: new Date(new Date(firstStart).getTime() + 1_800_000).toISOString() },
            { startAt: secondStart, endAt: new Date(new Date(secondStart).getTime() + 1_800_000).toISOString() },
          ] },
      ], handover: null,
      customerResponse: "I recorded your request with two options. The merchant still needs to confirm it.",
      channelResponse: { format: "text" as const, quickReplies: [] },
    };
    const publicResponse = {
      status: "completed" as const, inputId, text: turnOutput.customerResponse,
      quickReplies: [], nextTurnSequence: 2,
    };
    const committed = await runtime.commitTurn({
      sessionId: issued.sessionId, connectionId: firstConnectionId, inputId,
      output: turnOutput, publicResponse, nativeUsage: { inputUnits: 20, outputUnits: 12 },
    });
    expect(committed).toMatchObject({ status: "completed", text: turnOutput.customerResponse, terminalReason: null });
    expect(committed.actionStatuses).toHaveLength(2);
    await expect(runtime.beginTurn({
      sessionId: issued.sessionId, connectionId: firstConnectionId, inputId,
      message: "I am Alex and alex@example.com. Can I request a consultation tomorrow?",
    })).resolves.toMatchObject({ replayResponse: expect.objectContaining({ inputId, text: turnOutput.customerResponse }) });
    const effects = await adminClient!<{ leads: number; appointments: number; nativeUsage: number; turns: number }[]>`
      SELECT
        (SELECT count(*)::int FROM tenancy.leads lead WHERE lead.tenant_id = session.tenant_id AND lead.source = 'voice_web') AS leads,
        (SELECT count(*)::int FROM tenancy.appointment_requests request
          WHERE request.tenant_id = session.tenant_id AND request.conversation_id = session.conversation_id) AS appointments,
        (SELECT count(*)::int FROM operations.voice_native_usage usage WHERE usage.tenant_id = session.tenant_id) AS "nativeUsage",
        (SELECT count(*)::int FROM tenancy.voice_turns turn WHERE turn.tenant_id = session.tenant_id AND turn.session_id = session.id) AS turns
      FROM tenancy.voice_sessions session WHERE session.id = ${issued.sessionId}::uuid
    `;
    expect(effects[0]).toEqual({ leads: 1, appointments: 1, nativeUsage: 1, turns: 1 });
    const tenantContext = createTenantContext({
      tenantId, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", membershipId,
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: `voice-release-${randomUUID()}`,
    });
    const shared = new SharedDomainStore(tenantClient!);
    await expect(shared.takeOverConversation(tenantContext, turnContext.conversationId)).resolves.toMatchObject({ status: "accepted" });
    await expect(shared.releaseConversation(tenantContext, turnContext.conversationId)).resolves.toEqual({
      status: "released", automationMode: "voice",
    });

    const callbackInputId = randomUUID();
    await runtime.beginTurn({
      sessionId: issued.sessionId, connectionId: firstConnectionId, inputId: callbackInputId,
      message: "Please call me back tomorrow morning.",
    });
    const callbackDueAt = new Date(Date.now() + 86_400_000).toISOString();
    const callbackOutput = {
      schemaVersion: "sales-core.v1" as const, stage: "S9_ACTION_CLOSE" as const,
      intent: "callback_request", facts: [], knowledgeCitations: [],
      responseGoal: "Record the requested callback without claiming completion",
      proposedActions: [
        { type: "lead.capture" as const, name: "Alex", email: "alex@example.com", need: "Callback" },
        { type: "follow_up.create" as const, note: "Customer requested a callback", dueAt: callbackDueAt },
      ], handover: null,
      customerResponse: "I recorded your callback request for the team.",
      channelResponse: { format: "text" as const, quickReplies: [] },
    };
    await expect(runtime.commitTurn({
      sessionId: issued.sessionId, connectionId: firstConnectionId, inputId: callbackInputId,
      output: callbackOutput,
      publicResponse: {
        status: "completed", inputId: callbackInputId, text: callbackOutput.customerResponse,
        quickReplies: [], nextTurnSequence: 3,
      },
      nativeUsage: { inputUnits: 10, outputUnits: 8 },
    })).resolves.toMatchObject({ terminalReason: "callback_requested" });
    const durableOutcome = await adminClient!<{
      outcome: string; summary: string; callbackStatus: string; callbackDueAt: Date;
    }[]>`
      SELECT outcome.outcome_code AS outcome, outcome.summary_text AS summary,
        callback.status AS "callbackStatus", callback.due_at AS "callbackDueAt"
      FROM tenancy.voice_call_outcomes outcome
      JOIN tenancy.voice_callback_requests callback
        ON callback.tenant_id = outcome.tenant_id AND callback.session_id = outcome.session_id
      WHERE outcome.session_id = ${issued.sessionId}::uuid
    `;
    expect(durableOutcome[0]).toMatchObject({
      outcome: "callback_requested", summary: "The customer requested a callback.", callbackStatus: "pending",
    });
    expect(durableOutcome[0]?.callbackDueAt.toISOString()).toBe(callbackDueAt);
    const afterReserve = await adminClient!<{ reserved: number; settled: number; reservations: number; leases: number }[]>`
      SELECT account.reserved_quantity::int AS reserved, account.settled_quantity::int AS settled,
        (SELECT count(*)::int FROM tenancy.usage_reservations reservation
          WHERE reservation.tenant_id = account.tenant_id AND reservation.operation_id = ${issued.sessionId}) AS reservations,
        (SELECT count(*)::int FROM tenancy.voice_concurrency_leases lease
          WHERE lease.tenant_id = account.tenant_id AND lease.session_id = ${issued.sessionId}::uuid AND lease.released_at IS NULL) AS leases
      FROM tenancy.quota_accounts account WHERE account.id = ${quotaId}::uuid
    `;
    expect(afterReserve[0]).toEqual({ reserved: 2, settled: 0, reservations: 1, leases: 1 });

    const competing = await runtime.issue({
      deploymentKey, origin: "https://merchant.example", locale: "th", expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(runtime.authorize({
      sessionGrant: competing.sessionGrant, sessionId: competing.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: randomUUID(),
    })).rejects.toThrow(/voice_concurrency_exhausted/);

    await expect(runtime.disconnect(issued.sessionId, firstConnectionId)).resolves.toBe(true);
    await expect(runtime.disconnect(issued.sessionId, firstConnectionId)).resolves.toBe(true);
    await expect(runtime.authorize({
      sessionGrant: issued.sessionGrant, sessionId: issued.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: firstConnectionId,
    })).rejects.toThrow(/voice_connection_not_connectable/);
    const reconnectId = randomUUID();
    await expect(runtime.authorize({
      sessionGrant: issued.sessionGrant, sessionId: issued.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: reconnectId,
    })).resolves.toMatchObject({ replayed: false });

    const settlementAnchor = new Date();
    await adminClient!`
      UPDATE tenancy.voice_sessions SET connected_at = now() - interval '62 seconds'
      WHERE id = ${issued.sessionId}::uuid
    `;
    await adminClient!`
      UPDATE tenancy.voice_session_connections
      SET connected_at = ${new Date(settlementAnchor.getTime() - 62_000)},
          heartbeat_at = ${new Date(settlementAnchor.getTime() - 31_000)},
          disconnected_at = ${new Date(settlementAnchor.getTime() - 31_000)}
      WHERE id = ${firstConnectionId}::uuid
    `;
    await adminClient!`
      UPDATE tenancy.voice_session_connections
      SET connected_at = ${new Date(settlementAnchor.getTime() - 31_000)}, heartbeat_at = ${settlementAnchor}
      WHERE id = ${reconnectId}::uuid
    `;

    await expect(runtime.finish({
      sessionId: issued.sessionId, connectionId: reconnectId, elapsedSeconds: 62, terminalReason: "callback_requested",
    })).resolves.toEqual({ status: "ended", customerMinutes: 2, replayed: false });
    await expect(runtime.finish({
      sessionId: issued.sessionId, connectionId: reconnectId, elapsedSeconds: 1, terminalReason: "unavailable",
    })).resolves.toEqual({ status: "ended", customerMinutes: 2, replayed: true });
    await expect(runtime.authorize({
      sessionGrant: issued.sessionGrant, sessionId: issued.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: randomUUID(),
    })).rejects.toThrow(/voice_session_not_connectable/);

    const afterSettlement = await adminClient!<{
      reserved: number; settled: number; terminalEvents: number; reservationStatus: string;
      sessionStatus: string; leaseReleased: boolean; reportedSeconds: number; settledSeconds: number;
    }[]>`
      SELECT account.reserved_quantity::int AS reserved, account.settled_quantity::int AS settled,
        (SELECT count(*)::int FROM tenancy.usage_events event
          WHERE event.tenant_id = account.tenant_id AND event.operation_id = ${issued.sessionId} AND event.event_type = 'settled') AS "terminalEvents",
        reservation.status AS "reservationStatus", session.status AS "sessionStatus",
        session.reported_elapsed_seconds AS "reportedSeconds",
        session.settled_elapsed_seconds AS "settledSeconds",
        lease.released_at IS NOT NULL AS "leaseReleased"
      FROM tenancy.quota_accounts account
      JOIN tenancy.voice_sessions session ON session.tenant_id = account.tenant_id AND session.id = ${issued.sessionId}::uuid
      JOIN tenancy.usage_reservations reservation ON reservation.tenant_id = session.tenant_id AND reservation.id = session.usage_reservation_id
      JOIN tenancy.voice_concurrency_leases lease ON lease.tenant_id = session.tenant_id AND lease.session_id = session.id
      WHERE account.id = ${quotaId}::uuid
    `;
    expect(afterSettlement[0]).toEqual({
      reserved: 0, settled: 2, terminalEvents: 1, reservationStatus: "settled", sessionStatus: "ended",
      leaseReleased: true, reportedSeconds: 62, settledSeconds: 62,
    });

    const secondConnectionId = randomUUID();
    await expect(runtime.authorize({
      sessionGrant: competing.sessionGrant, sessionId: competing.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: secondConnectionId,
    })).resolves.toMatchObject({ replayed: false });
    await adminClient!`
      UPDATE tenancy.voice_session_connections
      SET connected_at = now() - interval '1 second', heartbeat_at = now()
      WHERE id = ${secondConnectionId}::uuid
    `;
    await expect(runtime.finish({
      sessionId: competing.sessionId, connectionId: secondConnectionId, elapsedSeconds: 1, terminalReason: "customer_ended",
    })).resolves.toEqual({ status: "ended", customerMinutes: 1, replayed: false });
    const finalAccount = await adminClient!<{ reserved: number; settled: number }[]>`
      SELECT reserved_quantity::int AS reserved, settled_quantity::int AS settled
      FROM tenancy.quota_accounts WHERE id = ${quotaId}::uuid
    `;
    expect(finalAccount[0]).toEqual({ reserved: 0, settled: 3 });

    const expired = await runtime.issue({
      deploymentKey, origin: "https://merchant.example", locale: "en", expiresAt: new Date(Date.now() + 60_000),
    });
    await adminClient!`
      UPDATE tenancy.voice_sessions
      SET created_at = now() - interval '2 minutes', grant_expires_at = now() - interval '1 minute'
      WHERE id = ${expired.sessionId}::uuid
    `;
    const stale = await runtime.issue({
      deploymentKey, origin: "https://merchant.example", locale: "en", expiresAt: new Date(Date.now() + 60_000),
    });
    const staleConnectionId = randomUUID();
    await runtime.authorize({
      sessionGrant: stale.sessionGrant, sessionId: stale.sessionId, origin: "https://merchant.example",
      protocolVersion: "djay.voice.v1", connectionId: staleConnectionId,
    });
    await adminClient!`
      UPDATE tenancy.voice_sessions SET connected_at = now() - interval '45 seconds'
      WHERE id = ${stale.sessionId}::uuid
    `;
    await adminClient!`
      UPDATE tenancy.voice_session_connections
      SET connected_at = now() - interval '45 seconds', heartbeat_at = now() - interval '31 seconds'
      WHERE id = ${staleConnectionId}::uuid
    `;
    await adminClient!`
      UPDATE tenancy.voice_concurrency_leases
      SET acquired_at = now() - interval '45 seconds', expires_at = now() + interval '75 seconds'
      WHERE session_id = ${stale.sessionId}::uuid
    `;
    const reaper = new VoiceReaperStore(workerClient!);
    const reapNow = new Date();
    const reaped = (await Promise.all([reaper.reap({
      now: reapNow, staleBefore: new Date(reapNow.getTime() - 30_000), limit: 20,
    }), reaper.reap({
      now: reapNow, staleBefore: new Date(reapNow.getTime() - 30_000), limit: 20,
    })])).flat();
    expect(new Set(reaped.map((item) => item.sessionId)).size).toBe(reaped.length);
    expect(reaped).toEqual(expect.arrayContaining([
      expect.objectContaining({ sessionId: expired.sessionId, terminalReason: "grant_expired", customerMinutes: 0 }),
      expect.objectContaining({ sessionId: stale.sessionId, terminalReason: "unavailable", customerMinutes: 1 }),
    ]));
    const recovered = await adminClient!<{ expiredStatus: string; staleStatus: string; openLeases: number; reserved: number }[]>`
      SELECT
        (SELECT status FROM tenancy.voice_sessions WHERE id = ${expired.sessionId}::uuid) AS "expiredStatus",
        (SELECT status FROM tenancy.voice_sessions WHERE id = ${stale.sessionId}::uuid) AS "staleStatus",
        (SELECT count(*)::int FROM tenancy.voice_concurrency_leases WHERE released_at IS NULL) AS "openLeases",
        reserved_quantity::int AS reserved
      FROM tenancy.quota_accounts WHERE id = ${quotaId}::uuid
    `;
    expect(recovered[0]).toEqual({ expiredStatus: "expired", staleStatus: "failed", openLeases: 0, reserved: 0 });

    const advancedTenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10";
    const advancedSubscriptionId = randomUUID();
    const advancedSnapshotId = randomUUID();
    const advancedQuotaId = randomUUID();
    const advancedAgentId = randomUUID();
    const advancedPlaybookVersionId = randomUUID();
    const advancedDeploymentKey = `djay_voice_deploy_${randomUUID().replaceAll("-", "")}`;
    const advancedPlanVersionId = "62000000-0000-4000-8000-000000000006";
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${advancedTenantId}::uuid AND product_key = 'voice' AND status <> 'cancelled'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (
        id, tenant_id, product_key, plan_version_id, status, period_start, period_end
      ) VALUES (
        ${advancedSubscriptionId}::uuid, ${advancedTenantId}::uuid, 'voice', ${advancedPlanVersionId}::uuid,
        'active', now() - interval '1 minute', now() + interval '30 days'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${advancedSnapshotId}::uuid, ${advancedTenantId}::uuid, ${advancedSubscriptionId}::uuid, 'voice',
        ${advancedPlanVersionId}::uuid, 'active', 'active', ${adminClient!.json({
          tenantId: advancedTenantId, subscriptionId: advancedSubscriptionId, productKey: "voice",
          publicPlanKey: "voice_advanced_gen2", planVersionId: advancedPlanVersionId, accessMode: "active",
          entitlements: { "voice.enabled": true, "voice.capability_profile": "voice_gen2" },
          allowances: { voice_minute: 100 }, overageRatesMinor: { voice_minute: null },
          limits: { concurrent_calls: 1 }, resolvedAt: new Date().toISOString(),
        })}, digest(${advancedSnapshotId}, 'sha256')
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.quota_accounts (
        id, tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
        included_quantity, safety_cap_quantity
      ) VALUES (
        ${advancedQuotaId}::uuid, ${advancedTenantId}::uuid, ${advancedSubscriptionId}::uuid,
        'voice', 'voice_minute', now() - interval '1 minute', now() + interval '30 days', 100, 10
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.ai_agents (
        id, tenant_id, name, status, default_language, created_by_membership_id
      ) VALUES (
        ${advancedAgentId}::uuid, ${advancedTenantId}::uuid, 'Advanced Voice', 'active', 'en',
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11'::uuid
      )
    `;
    const advancedPlaybook = { schemaVersion: 1, playbookVersionId: advancedPlaybookVersionId };
    await adminClient!`
      INSERT INTO tenancy.ai_playbook_versions (
        id, tenant_id, agent_id, version, status, playbook_json, playbook_sha256, published_by_membership_id
      ) VALUES (
        ${advancedPlaybookVersionId}::uuid, ${advancedTenantId}::uuid, ${advancedAgentId}::uuid, 1, 'published',
        ${adminClient!.json(advancedPlaybook)}, digest(${JSON.stringify(advancedPlaybook)}, 'sha256'),
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11'::uuid
      )
    `;
    await adminClient!`
      UPDATE tenancy.ai_agents SET current_published_playbook_version_id = ${advancedPlaybookVersionId}::uuid
      WHERE tenant_id = ${advancedTenantId}::uuid AND id = ${advancedAgentId}::uuid
    `;
    await adminClient!`
      INSERT INTO tenancy.voice_deployments (
        tenant_id, agent_id, name, capability_profile, deployment_key_hash, key_prefix, allowed_origins,
        greeting_th, greeting_en, automated_disclosure_th, automated_disclosure_en,
        max_call_seconds, reconnect_window_seconds, created_by_membership_id
      ) VALUES (
        ${advancedTenantId}::uuid, ${advancedAgentId}::uuid, 'Advanced restricted runtime', 'voice_gen2',
        ${hashOpaqueToken(advancedDeploymentKey)},
        ${advancedDeploymentKey.slice(0, 20)}, ARRAY['https://advanced.example'],
        'สวัสดีครับ', 'Hello', 'นี่คือผู้ช่วยเสียงอัตโนมัติของเรา',
        'This is our automated voice assistant.', 90, 30,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11'::uuid
      )
    `;
    await expect(runtime.issue({
      deploymentKey: advancedDeploymentKey, origin: "https://advanced.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_profile_not_available/);

    const routeCandidateId = randomUUID();
    const routeProposerId = randomUUID();
    const routeReviewerId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES
        (${routeProposerId}::uuid, ${`${routeProposerId}@example.test`}, 'Runtime route proposer', 'test-hash', 'active'),
        (${routeReviewerId}::uuid, ${`${routeReviewerId}@example.test`}, 'Runtime route reviewer', 'test-hash', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.voice_route_candidates (
        id, capability_profile, provider_key, model_key, region_key, status,
        proposed_by_platform_user_id, reviewed_by_platform_user_id,
        qualification_evidence_sha256, reviewed_at
      ) VALUES (
        ${routeCandidateId}::uuid, 'voice_gen2', 'google_live', 'qualified-runtime-model',
        'global', 'qualified', ${routeProposerId}::uuid, ${routeReviewerId}::uuid,
        digest('qualified-runtime-evidence', 'sha256'), now()
      )
    `;
    await adminClient!`
      UPDATE platform.voice_active_routes
      SET primary_candidate_id = ${routeCandidateId}::uuid, canary_candidate_id = NULL,
          canary_percent = 0, routing_change_id = NULL, version = version + 1,
          updated_by_platform_user_id = ${routeReviewerId}::uuid, updated_at = now()
      WHERE capability_profile = 'voice_gen2'
    `;
    await adminClient!`
      UPDATE platform.voice_profile_controls
      SET mode = 'running', admission_enabled = true, reason_code = 'runtime_integration_admitted',
          version = version + 1, changed_by_platform_user_id = ${routeReviewerId}::uuid,
          changed_at = now()
      WHERE capability_profile = 'voice_gen2'
    `;

    const advancedIssued = await runtime.issue({
      deploymentKey: advancedDeploymentKey, origin: "https://advanced.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    });
    expect(advancedIssued).toMatchObject({
      capabilityProfile: "voice_gen2", publicLabel: "Second-Generation Voice Engine",
    });
    expect(JSON.stringify(advancedIssued)).not.toMatch(/google_live|qualified-runtime-model|provider|model|region/i);
    const advancedConnectionId = randomUUID();
    const advancedAuthorized = await runtime.authorize({
      sessionGrant: advancedIssued.sessionGrant, sessionId: advancedIssued.sessionId,
      origin: "https://advanced.example", protocolVersion: "djay.voice.v1",
      connectionId: advancedConnectionId,
    });
    expect(advancedAuthorized).toEqual(expect.objectContaining({
      sessionId: advancedIssued.sessionId, capabilityProfile: "voice_gen2",
      resumeWindowSeconds: 30, replayed: false,
      route: {
        providerKey: "google_live", modelKey: "qualified-runtime-model", regionKey: "global",
      },
    }));
    const assignment = await adminClient!<{ count: number; candidateId: string }[]>`
      SELECT count(*)::int AS count, (array_agg(candidate_id))[1]::text AS "candidateId"
      FROM operations.voice_session_routes
      WHERE tenant_id = ${advancedTenantId}::uuid AND session_id = ${advancedIssued.sessionId}::uuid
    `;
    expect(assignment[0]).toEqual({ count: 1, candidateId: routeCandidateId });

    await adminClient!`
      UPDATE platform.voice_profile_controls SET admission_enabled = false,
        reason_code = 'runtime_integration_draining', version = version + 1, changed_at = now()
      WHERE capability_profile = 'voice_gen2'
    `;
    await expect(runtime.issue({
      deploymentKey: advancedDeploymentKey, origin: "https://advanced.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_profile_not_available/);
    await expect(runtime.disconnect(advancedIssued.sessionId, advancedConnectionId)).resolves.toBe(true);
    const advancedReconnectId = randomUUID();
    await expect(runtime.authorize({
      sessionGrant: advancedIssued.sessionGrant, sessionId: advancedIssued.sessionId,
      origin: "https://advanced.example", protocolVersion: "djay.voice.v1",
      connectionId: advancedReconnectId,
    })).resolves.toMatchObject({
      capabilityProfile: "voice_gen2", replayed: false,
      route: { providerKey: "google_live", modelKey: "qualified-runtime-model", regionKey: "global" },
    });
    await expect(runtime.heartbeat(advancedIssued.sessionId, advancedReconnectId))
      .resolves.toEqual({ alive: true, runtimeMode: "running" });
    await adminClient!`
      UPDATE platform.voice_profile_controls SET mode = 'paused',
        reason_code = 'runtime_integration_incident', version = version + 1, changed_at = now()
      WHERE capability_profile = 'voice_gen2'
    `;
    await expect(runtime.heartbeat(advancedIssued.sessionId, advancedReconnectId))
      .resolves.toEqual({ alive: false, runtimeMode: "emergency_stop" });
    await adminClient!`
      UPDATE platform.voice_profile_controls SET mode = 'running',
        reason_code = 'runtime_integration_recovered', version = version + 1, changed_at = now()
      WHERE capability_profile = 'voice_gen2'
    `;
    await expect(runtime.heartbeat(advancedIssued.sessionId, advancedReconnectId))
      .resolves.toEqual({ alive: true, runtimeMode: "running" });
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${advancedTenantId}::uuid AND id = ${advancedSubscriptionId}::uuid
    `;
    await expect(runtime.heartbeat(advancedIssued.sessionId, advancedReconnectId))
      .resolves.toEqual({ alive: false, runtimeMode: "running" });
    await expect(runtime.finish({
      sessionId: advancedIssued.sessionId, connectionId: advancedReconnectId,
      elapsedSeconds: 1, terminalReason: "unavailable",
    })).resolves.toMatchObject({ status: "failed", replayed: false });
  });
});
