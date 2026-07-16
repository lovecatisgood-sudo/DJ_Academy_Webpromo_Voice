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
          limits: { concurrent_calls: 1 }, resolvedAt: new Date().toISOString(),
        })}, digest(${snapshotId}, 'sha256')
      )
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
    expect(created.deploymentKey).toMatch(/^djay_voice_deploy_/);
    const listed = await store.list(owner);
    expect(listed.capability).toEqual({ enabled: true, publicLabel: "First-Generation Voice Engine" });
    expect(listed.deployments).toEqual(expect.arrayContaining([expect.objectContaining({
      id: created.deploymentId, keyPrefix: created.deploymentKey.slice(0, 20),
      allowedOrigins: ["https://merchant.example"], status: "active",
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
    })).resolves.toMatchObject({ capabilityProfile: "voice_gen1" });
    await expect(store.changeStatus(owner, created.deploymentId, "disable"))
      .resolves.toEqual({ status: "updated", deploymentStatus: "disabled" });
    await expect(runtime.issue({
      deploymentKey: created.deploymentKey, origin: "https://merchant.example", locale: "en",
      expiresAt: new Date(Date.now() + 60_000),
    })).rejects.toThrow(/voice_deployment_not_available/);
    await expect(store.changeStatus(owner, created.deploymentId, "enable"))
      .resolves.toEqual({ status: "updated", deploymentStatus: "active" });
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
      "voice.deployment.disable", "voice.deployment.enable", "voice.deployment.revoke",
    ]);
  });

  it("creates a tenant-safe Advanced deployment and keeps it fail-closed without reviewed admission", async () => {
    const tenantId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10";
    const subscriptionId = randomUUID(); const snapshotId = randomUUID();
    const advancedPlanVersionId = "62000000-0000-4000-8000-000000000006";
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
            "lead_capture.enabled": true, "appointment_request.enabled": true,
            "sales_email_action.enabled": true, "human_handover.enabled": true,
          },
          allowances: { voice_minute: 500 }, overageRatesMinor: { voice_minute: null },
          limits: { concurrent_calls: 2 }, resolvedAt: new Date().toISOString(),
        })}, digest(${snapshotId}, 'sha256')
      )
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
    const runtime = new VoiceRuntimeStore(voiceClient!);
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
