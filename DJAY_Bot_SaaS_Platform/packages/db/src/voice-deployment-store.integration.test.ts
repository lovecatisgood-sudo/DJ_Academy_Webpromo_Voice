import { randomUUID } from "node:crypto";
import { hashOpaqueToken } from "@djay/auth";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { VoiceDeploymentStore } from "./voice-deployment-store";
import { VoiceRuntimeStore } from "./voice-runtime-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const voiceUrl = process.env.VOICE_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && voiceUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const voiceClient = enabled ? createDatabaseClient(voiceUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await tenantClient?.end(); await voiceClient?.end(); await adminClient?.end();
});

describe.runIf(enabled)("Voice tenant deployment operations", () => {
  it("enforces Basic authority, tenant isolation, exact origins, one-time keys, and irreversible revocation", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const subscriptionId = randomUUID(); const snapshotId = randomUUID();
    const planVersionId = "62000000-0000-4000-8000-000000000005";
    await adminClient!`
      UPDATE platform.voice_runtime_controls
      SET mode = 'running', reason_code = 'integration_test', version = version + 1, changed_at = now()
      WHERE singleton = true
    `;
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND product_key = 'voice' AND status <> 'cancelled'
    `;
    await adminClient!`
      UPDATE tenancy.voice_deployments SET status = 'revoked', revoked_at = COALESCE(revoked_at, now())
      WHERE tenant_id = ${tenantId}::uuid AND status <> 'revoked'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
      VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'voice', ${planVersionId}::uuid, 'active', now(), now() + interval '30 days')
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'voice', ${planVersionId}::uuid,
        'active', 'active', ${adminClient!.json({
          tenantId, subscriptionId, productKey: "voice", publicPlanKey: "voice_basic_gen1", planVersionId,
          accessMode: "active", entitlements: { "voice.enabled": true, "voice.capability_profile": "voice_gen1" },
          allowances: { voice_minute: 100 }, overageRatesMinor: { voice_minute: null },
          limits: { active_bots: 1, concurrent_calls: 1 }, resolvedAt: new Date().toISOString(),
        })}, digest(${snapshotId}, 'sha256')
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.quota_accounts (
        id, tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
        included_quantity, safety_cap_quantity
      ) VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'voice', 'voice_minute',
        now() - interval '1 minute', now() + interval '30 days', 100, 100)
    `;
    const owner = createTenantContext({
      tenantId, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "p7-voice-deployment-owner",
    });
    const other = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "p7-voice-deployment-other",
    });
    const store = new VoiceDeploymentStore(tenantClient!);
    const input = {
      name: "Main browser voice", agentName: "Mali", businessName: "Merchant Store",
      allowedOrigins: ["https://merchant.example"], defaultLocale: "en" as const,
      greetingTh: "สวัสดีครับ", greetingEn: "Hello, how can I help?",
      automatedDisclosureTh: "นี่คือผู้ช่วยเสียงอัตโนมัติของเรา",
      automatedDisclosureEn: "This is our automated voice assistant.",
      maxCallSeconds: 90, reconnectWindowSeconds: 30,
    };
    await expect(store.create(owner, { ...input, allowedOrigins: ["https://merchant.example/path"] }))
      .resolves.toEqual({ status: "validation_failed" });
    const created = await store.create(owner, input);
    expect(created.status).toBe("created");
    if (created.status !== "created") throw new Error("Expected Voice deployment.");
    await expect(store.create(owner, { ...input, name: "Second browser voice" }))
      .resolves.toEqual({ status: "limit_reached" });
    expect(created.deploymentKey).toMatch(/^djay_voice_deploy_/);
    const listed = await store.list(owner);
    expect(listed.capability).toEqual({ enabled: true, publicLabel: "First-Generation Voice Engine" });
    expect(listed.deployments).toEqual(expect.arrayContaining([expect.objectContaining({
      id: created.deploymentId, keyPrefix: created.deploymentKey.slice(0, 20),
      allowedOrigins: ["https://merchant.example"], status: "active",
      trafficStatus: "inactive", liveAt: null,
      agentName: "Mali", businessName: "Merchant Store",
    })]));
    expect(JSON.stringify(listed)).not.toContain(created.deploymentKey);
    const otherList = await store.list(other);
    expect(otherList.deployments.some((deployment) => deployment.id === created.deploymentId)).toBe(false);
    const studio = await store.getStudio(owner, created.deploymentId);
    expect(studio).toMatchObject({
      publicLabel: "First-Generation Voice Engine", editable: true, health: "ready",
      deployment: { id: created.deploymentId, agentName: "Mali", draftRevision: 1, currentPublishedVersion: 1 },
      usage: { activeCalls: 0, concurrencyLimit: 1 },
      quality: { totalCalls: 0, completedCalls: 0, failedCalls: 0 },
    });
    expect(await store.getStudio(other, created.deploymentId)).toBeNull();
    if (!studio) throw new Error("Expected Voice Studio state.");
    const saved = await store.updateStudio(owner, created.deploymentId, {
      revision: studio.deployment.draftRevision, name: "Primary website voice", agentName: "Mali Voice",
      businessName: "Merchant Store", defaultLocale: "th", allowedOrigins: ["https://merchant.example"],
      greetingTh: "สวัสดีค่ะ ยินดีให้บริการ", greetingEn: "Hello, welcome to Merchant Store.",
      automatedDisclosureTh: "นี่คือผู้ช่วยเสียงอัตโนมัติของ Merchant Store",
      automatedDisclosureEn: "This is Merchant Store's automated voice assistant.",
      maxCallSeconds: 120, reconnectWindowSeconds: 20,
      definition: { ...(studio.deployment.definition as object), tone: "Warm and direct" },
      knowledgeRevisionIds: [],
    });
    expect(saved).toEqual({ status: "updated", revision: 2 });
    await expect(store.updateStudio(owner, created.deploymentId, {
      revision: 1, name: "Stale edit", agentName: "Mali Voice", businessName: "Merchant Store",
      defaultLocale: "th", allowedOrigins: ["https://merchant.example"],
      greetingTh: "สวัสดีค่ะ", greetingEn: "Hello",
      automatedDisclosureTh: "นี่คือผู้ช่วยเสียงอัตโนมัติของเรา",
      automatedDisclosureEn: "This is our automated voice assistant.",
      maxCallSeconds: 120, reconnectWindowSeconds: 20,
      definition: studio.deployment.definition, knowledgeRevisionIds: [],
    })).resolves.toEqual({ status: "conflict" });
    await expect(store.publishStudio(owner, created.deploymentId)).resolves.toMatchObject({ status: "published", version: 2 });
    await expect(store.getStudio(owner, created.deploymentId)).resolves.toMatchObject({
      deployment: {
        name: "Primary website voice", agentName: "Mali Voice", defaultLocale: "th",
        draftRevision: 3, currentPublishedVersion: 2, maxCallSeconds: 120, reconnectWindowSeconds: 20,
      },
    });
    await expect(store.changeStatus(other, created.deploymentId, "revoke")).resolves.toEqual({ status: "not_found" });

    const runtime = new VoiceRuntimeStore(voiceClient!);
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://merchant.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_deployment_not_available/);
    await expect(store.changeTraffic(owner, created.deploymentId, "go_live"))
      .resolves.toEqual({ status: "verification_required" });
    await expect(store.requestInstallCheck(other, created.deploymentId, "https://merchant.example"))
      .resolves.toEqual({ status: "not_found" });
    await expect(store.requestInstallCheck(owner, created.deploymentId, "https://merchant.example"))
      .resolves.toMatchObject({ status: "requested" });
    await expect(runtime.reportInstall(created.deploymentKey, "https://merchant.example")).resolves.toBe(1);
    await expect(store.listInstallChecks(owner, created.deploymentId)).resolves.toEqual([
      expect.objectContaining({ deploymentId: created.deploymentId, targetOrigin: "https://merchant.example", status: "verified" }),
    ]);
    await expect(store.changeTraffic(owner, created.deploymentId, "go_live"))
      .resolves.toEqual({ status: "updated", trafficStatus: "live" });
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://merchant.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).resolves.toMatchObject({ capabilityProfile: "voice_gen1" });
    await expect(store.changeStatus(owner, created.deploymentId, "disable"))
      .resolves.toEqual({ status: "updated", deploymentStatus: "disabled" });
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://merchant.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_deployment_not_available/);
    await expect(store.changeStatus(owner, created.deploymentId, "enable"))
      .resolves.toEqual({ status: "updated", deploymentStatus: "active" });
    await expect(store.changeTraffic(owner, created.deploymentId, "go_live"))
      .resolves.toEqual({ status: "updated", trafficStatus: "live" });
    await expect(store.changeTraffic(owner, created.deploymentId, "stop"))
      .resolves.toEqual({ status: "updated", trafficStatus: "inactive" });
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://merchant.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_deployment_not_available/);
    await expect(store.changeStatus(owner, created.deploymentId, "revoke"))
      .resolves.toEqual({ status: "updated", deploymentStatus: "revoked" });
    await expect(store.changeStatus(owner, created.deploymentId, "enable"))
      .resolves.toEqual({ status: "not_allowed" });
    const audit = await adminClient!<{ actions: string[] }[]>`
      SELECT array_agg(action ORDER BY created_at, id) AS actions FROM tenancy.audit_logs
      WHERE tenant_id = ${tenantId}::uuid AND target_id = ${created.deploymentId}
    `;
    expect(audit[0]?.actions).toEqual([
      "voice.deployment.created", "voice.studio.saved", "voice.playbook.published",
      "voice.deployment.go_live",
      "voice.deployment.disable", "voice.deployment.enable", "voice.deployment.go_live",
      "voice.deployment.stop_traffic",
      "voice.deployment.revoke",
    ]);
  });

  it("creates a tenant-safe Advanced deployment and keeps it fail-closed without reviewed admission", async () => {
    const tenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10";
    const subscriptionId = randomUUID(); const snapshotId = randomUUID();
    const advancedPlanVersionId = "62000000-0000-4000-8000-000000000006";
    await adminClient!`
      UPDATE platform.voice_runtime_controls
      SET mode = 'running', reason_code = 'integration_test', version = version + 1, changed_at = now()
      WHERE singleton = true
    `;
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND product_key = 'voice' AND status <> 'cancelled'
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
      VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'voice', ${advancedPlanVersionId}::uuid, 'active', now(), now() + interval '30 days')
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'voice', ${advancedPlanVersionId}::uuid,
        'active', 'active', ${adminClient!.json({
          tenantId, subscriptionId, productKey: "voice", publicPlanKey: "voice_advanced_gen2",
          planVersionId: advancedPlanVersionId, accessMode: "active",
          entitlements: {
            "voice.enabled": true, "voice.capability_profile": "voice_gen2",
            "voice.public_label": "Second-Generation Voice Engine", "voice.gen1_fallback": false,
            "analytics.level": "advanced",
            "lead_capture.enabled": true, "appointment_request.enabled": true,
            "sales_email_action.enabled": true, "human_handover.enabled": true,
          },
          allowances: { voice_minute: 500 }, overageRatesMinor: { voice_minute: null },
          limits: { concurrent_calls: 2 }, resolvedAt: new Date().toISOString(),
        })}, digest(${snapshotId}, 'sha256')
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.quota_accounts (
        id, tenant_id, subscription_id, product_key, customer_unit, period_start, period_end,
        included_quantity, safety_cap_quantity
      ) VALUES (${randomUUID()}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'voice', 'voice_minute',
        now() - interval '1 minute', now() + interval '30 days', 500, 500)
    `;
    const owner = createTenantContext({
      tenantId, userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "p8-voice-advanced-deployment",
    });
    const store = new VoiceDeploymentStore(tenantClient!);
    const created = await store.create(owner, {
      name: "Advanced browser voice", agentName: "Arun", businessName: "Advanced Merchant",
      allowedOrigins: ["https://advanced.example"], defaultLocale: "en",
      greetingTh: "สวัสดีครับ", greetingEn: "Hello, how can I help?",
      automatedDisclosureTh: "นี่คือผู้ช่วยเสียงอัตโนมัติของเรา",
      automatedDisclosureEn: "This is our automated voice assistant.",
      maxCallSeconds: 180, reconnectWindowSeconds: 30,
    });
    expect(created.status).toBe("created");
    if (created.status !== "created") throw new Error("Expected Advanced Voice deployment.");
    const listed = await store.list(owner);
    expect(listed.capability).toEqual({ enabled: true, publicLabel: "Second-Generation Voice Engine" });
    expect(listed.deployments).toEqual(expect.arrayContaining([expect.objectContaining({
      id: created.deploymentId, publicLabel: "Second-Generation Voice Engine",
    })]));
    expect(JSON.stringify(listed)).not.toMatch(/voice_gen2|provider|model/i);
    await expect(store.getStudio(owner, created.deploymentId)).resolves.toMatchObject({
      publicLabel: "Second-Generation Voice Engine", editable: true,
      health: "route_unavailable", runtimeAvailability: "unavailable",
      usage: { concurrencyLimit: 2 },
    });
    const identifiers = {
      contactId: randomUUID(), conversationId: randomUUID(), leadId: randomUUID(),
      sessionId: randomUUID(), completedTurnId: randomUUID(), failedTurnId: randomUUID(),
    };
    const deploymentAuthority = await adminClient!<{ agentId: string; playbookVersionId: string }[]>`
      SELECT deployment.agent_id AS "agentId",
             agent.current_published_playbook_version_id AS "playbookVersionId"
      FROM tenancy.voice_deployments deployment
      JOIN tenancy.ai_agents agent
        ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
      WHERE deployment.tenant_id = ${tenantId}::uuid AND deployment.id = ${created.deploymentId}::uuid
    `;
    await adminClient!`
      INSERT INTO tenancy.contacts (id, tenant_id, display_name, locale)
      VALUES (${identifiers.contactId}::uuid, ${tenantId}::uuid, 'Analytics visitor', 'en')
    `;
    await adminClient!`
      INSERT INTO tenancy.leads (id, tenant_id, contact_id, title, source)
      VALUES (${identifiers.leadId}::uuid, ${tenantId}::uuid, ${identifiers.contactId}::uuid, 'Advanced voice lead', 'voice_web')
    `;
    await adminClient!`
      INSERT INTO tenancy.conversations (
        id, tenant_id, contact_id, lead_id, product_key, public_plan_key,
        entitlement_snapshot_id, channel_kind, automation_mode, status, closed_at
      ) VALUES (
        ${identifiers.conversationId}::uuid, ${tenantId}::uuid, ${identifiers.contactId}::uuid,
        ${identifiers.leadId}::uuid, 'voice', 'voice_advanced_gen2', ${snapshotId}::uuid,
        'voice', 'closed', 'closed', now() - interval '30 seconds'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.voice_sessions (
        id, tenant_id, deployment_id, agent_id, playbook_version_id, contact_id,
        conversation_id, entitlement_snapshot_id, capability_profile, public_label,
        locale, grant_hash, grant_expires_at, max_call_seconds, reconnect_window_seconds,
        status, settled_minutes, connected_at, ended_at, terminal_reason
      ) VALUES (
        ${identifiers.sessionId}::uuid, ${tenantId}::uuid, ${created.deploymentId}::uuid,
        ${deploymentAuthority[0]!.agentId}::uuid, ${deploymentAuthority[0]!.playbookVersionId}::uuid,
        ${identifiers.contactId}::uuid, ${identifiers.conversationId}::uuid, ${snapshotId}::uuid,
        'voice_gen2', 'Second-Generation Voice Engine', 'en', digest(${identifiers.sessionId}, 'sha256'),
        now() + interval '5 minutes', 180, 30, 'ended', 2,
        now() - interval '120 seconds', now() - interval '30 seconds', 'completed'
      )
    `;
    for (const { connectedSecondsAgo, disconnectedSecondsAgo } of [
      { connectedSecondsAgo: 120, disconnectedSecondsAgo: 90 },
      { connectedSecondsAgo: 75, disconnectedSecondsAgo: 30 },
    ]) {
      await adminClient!`
        INSERT INTO tenancy.voice_session_connections (
          id, tenant_id, session_id, connected_at, disconnected_at, heartbeat_at, status
        ) VALUES (
          ${randomUUID()}::uuid, ${tenantId}::uuid, ${identifiers.sessionId}::uuid,
          now() - make_interval(secs => ${connectedSecondsAgo}),
          now() - make_interval(secs => ${disconnectedSecondsAgo}),
          now() - make_interval(secs => ${disconnectedSecondsAgo}), 'ended'
        )
      `;
    }
    await adminClient!`
      INSERT INTO tenancy.voice_turns (
        id, tenant_id, session_id, turn_sequence, input_id, status,
        customer_message_sha256, structured_output_json, public_response_json,
        started_at, completed_at
      ) VALUES (
        ${identifiers.completedTurnId}::uuid, ${tenantId}::uuid, ${identifiers.sessionId}::uuid,
        1, ${randomUUID()}::uuid, 'completed', digest(${identifiers.completedTurnId}, 'sha256'),
        ${adminClient!.json({ stage: "S2_DISCOVERY", intent: "product_interest", proposedActions: [] })},
        ${adminClient!.json({ status: "completed", text: "Safe response" })},
        now() - interval '70 seconds', now() - interval '69.2 seconds'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.voice_turns (
        id, tenant_id, session_id, turn_sequence, input_id, status,
        customer_message_sha256, safe_error_code, started_at, completed_at
      ) VALUES (
        ${identifiers.failedTurnId}::uuid, ${tenantId}::uuid, ${identifiers.sessionId}::uuid,
        2, ${randomUUID()}::uuid, 'failed', digest(${identifiers.failedTurnId}, 'sha256'),
        'temporarily_unavailable', now() - interval '60 seconds', now() - interval '59 seconds'
      )
    `;
    await adminClient!`
      INSERT INTO tenancy.appointment_requests (
        tenant_id, lead_id, conversation_id, status, timezone, idempotency_key
      ) VALUES (
        ${tenantId}::uuid, ${identifiers.leadId}::uuid, ${identifiers.conversationId}::uuid,
        'requested', 'Asia/Bangkok', ${`analytics:${identifiers.sessionId}`}
      )
    `;
    const analytics = await store.analytics(owner, { deploymentId: created.deploymentId, periodDays: 30 });
    expect(analytics).toMatchObject({
      periodDays: 30, level: "advanced", deploymentId: created.deploymentId,
      summary: {
        sessions: 1, connectedCalls: 1, completedCalls: 1, failedCalls: 0,
        completedTurns: 1, failedTurns: 1, leads: 1, appointmentRequests: 1,
        settledMinutes: 2, reconnectingCalls: 1,
      },
      outcomes: [{ outcome: "engaged", calls: 1 }],
      languages: [{ locale: "en", calls: 1 }],
      terminalReasons: [{ reason: "completed", calls: 1 }],
      turnFailures: [{ errorCode: "temporarily_unavailable", turns: 1 }],
    });
    expect(analytics?.daily).toHaveLength(30);
    expect(analytics?.summary.averageTurnMilliseconds).toBeGreaterThan(0);
    expect(JSON.stringify(analytics)).not.toMatch(/provider|model|route|cost|price|margin/i);
    await expect(store.analytics(createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "p8-cross-tenant-analytics",
    }), { deploymentId: created.deploymentId })).resolves.toBeNull();
    const runtime = new VoiceRuntimeStore(voiceClient!);
    await expect(store.requestInstallCheck(owner, created.deploymentId, "https://advanced.example"))
      .resolves.toMatchObject({ status: "requested" });
    await expect(runtime.reportInstall(created.deploymentKey, "https://advanced.example")).resolves.toBe(1);
    await expect(store.changeTraffic(owner, created.deploymentId, "go_live"))
      .resolves.toEqual({ status: "updated", trafficStatus: "live" });
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://advanced.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_profile_not_available/);

    const basicSubscriptionId = randomUUID(); const basicSnapshotId = randomUUID();
    const basicPlanVersionId = "62000000-0000-4000-8000-000000000005";
    await adminClient!`
      UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${subscriptionId}::uuid
    `;
    await adminClient!`
      INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status, period_start, period_end)
      VALUES (${basicSubscriptionId}::uuid, ${tenantId}::uuid, 'voice', ${basicPlanVersionId}::uuid, 'active', now(), now() + interval '30 days')
    `;
    await adminClient!`
      INSERT INTO tenancy.entitlement_snapshots (
        id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status,
        access_mode, resolved_json, resolution_hash
      ) VALUES (
        ${basicSnapshotId}::uuid, ${tenantId}::uuid, ${basicSubscriptionId}::uuid, 'voice', ${basicPlanVersionId}::uuid,
        'active', 'active', ${adminClient!.json({
          tenantId, subscriptionId: basicSubscriptionId, productKey: "voice", publicPlanKey: "voice_basic_gen1",
          planVersionId: basicPlanVersionId, accessMode: "active",
          entitlements: { "voice.enabled": true, "voice.capability_profile": "voice_gen1" },
          allowances: { voice_minute: 100 }, overageRatesMinor: { voice_minute: null },
          limits: { concurrent_calls: 1 }, resolvedAt: new Date().toISOString(),
        })}, digest(${basicSnapshotId}, 'sha256')
      )
    `;
    await expect(store.analytics(owner, { deploymentId: created.deploymentId })).resolves.toMatchObject({
      level: "core", outcomes: [], languages: [], terminalReasons: [], turnFailures: [], daily: [],
    });
    await expect(store.changeStatus(owner, created.deploymentId, "disable"))
      .resolves.toEqual({ status: "updated", deploymentStatus: "disabled" });
    await expect(store.changeStatus(owner, created.deploymentId, "enable"))
      .resolves.toEqual({ status: "not_entitled" });
    await adminClient!`
      UPDATE tenancy.voice_deployments SET status = 'active', updated_at = now()
      WHERE tenant_id = ${tenantId}::uuid AND id = ${created.deploymentId}::uuid
    `;
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://advanced.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_deployment_not_available/);
    await expect(voiceClient!`
      SELECT * FROM tenancy.issue_voice_basic_grant(
        ${hashOpaqueToken(created.deploymentKey)},
        ${hashOpaqueToken(`djay_voice_grant_${randomUUID().replaceAll("-", "")}`)},
        'https://advanced.example', ${randomUUID()}::uuid, ${randomUUID()}::uuid,
        ${randomUUID()}::uuid, now() + interval '1 minute', 'en'
      )
    `).rejects.toThrow(/tenancy_voice_session_deployment_capability_fk/);
  });
});
