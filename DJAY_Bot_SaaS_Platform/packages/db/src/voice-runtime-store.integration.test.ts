import { randomUUID } from "node:crypto";
import { hashOpaqueToken } from "@djay/auth";
import { voiceSessionGrantSchema } from "@djay/voice-runtime";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { VoiceRuntimeStore } from "./voice-runtime-store";
import { VoiceReaperStore } from "./voice-operations-store";

const voiceUrl = process.env.VOICE_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const workerUrl = process.env.WORKER_DATABASE_URL;
const enabled = Boolean(voiceUrl && adminUrl && workerUrl);
const voiceClient = enabled ? createDatabaseClient(voiceUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
const workerClient = enabled ? createDatabaseClient(workerUrl!) : null;

afterAll(async () => {
  await voiceClient?.end();
  await adminClient?.end();
  await workerClient?.end();
});

describe.runIf(enabled)("P7 Voice Basic restricted session authority", () => {
  it("issues opaque Gen1 grants, reserves atomically, reconnects, and settles exactly once", async () => {
    const tenantId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10";
    const membershipId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11";
    const subscriptionId = randomUUID();
    const snapshotId = randomUUID();
    const quotaId = randomUUID();
    const deploymentId = randomUUID();
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
      INSERT INTO tenancy.voice_deployments (
        id, tenant_id, name, deployment_key_hash, key_prefix, allowed_origins,
        default_locale, greeting_th, greeting_en, automated_disclosure_th,
        automated_disclosure_en, max_call_seconds, reconnect_window_seconds,
        created_by_membership_id
      ) VALUES (
        ${deploymentId}::uuid, ${tenantId}::uuid, 'Main browser voice',
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
      sessionId: issued.sessionId, connectionId: reconnectId, elapsedSeconds: 62, terminalReason: "completed",
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
      INSERT INTO tenancy.voice_deployments (
        tenant_id, name, deployment_key_hash, key_prefix, allowed_origins,
        greeting_th, greeting_en, automated_disclosure_th, automated_disclosure_en,
        max_call_seconds, reconnect_window_seconds, created_by_membership_id
      ) VALUES (
        ${advancedTenantId}::uuid, 'Advanced must not enter P7', ${hashOpaqueToken(advancedDeploymentKey)},
        ${advancedDeploymentKey.slice(0, 20)}, ARRAY['https://advanced.example'],
        'สวัสดีครับ', 'Hello', 'นี่คือผู้ช่วยเสียงอัตโนมัติของเรา',
        'This is our automated voice assistant.', 90, 30,
        'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11'::uuid
      )
    `;
    await expect(runtime.issue({
      deploymentKey: advancedDeploymentKey, origin: "https://advanced.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_deployment_not_available/);
  });
});
