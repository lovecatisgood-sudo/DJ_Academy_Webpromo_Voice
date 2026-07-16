import { randomUUID } from "node:crypto";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PlatformVoiceOperationsStore } from "./voice-operations-store";

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(platformUrl && adminUrl);
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => {
  await platformClient?.end();
  await adminClient?.end();
});

describe.runIf(enabled)("Voice platform operations", () => {
  it("keeps the control function-only, role-bound, recently auditable, and reversible", async () => {
    const ownerId = randomUUID();
    const supportId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES (${ownerId}::uuid, ${`${ownerId}@example.test`}, 'Voice operator', 'test-hash', 'active'),
             (${supportId}::uuid, ${`${supportId}@example.test`}, 'Support operator', 'test-hash', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.role_assignments (platform_user_id, role)
      VALUES (${ownerId}::uuid, 'platform_owner'), (${supportId}::uuid, 'platform_support')
    `;
    const owner = createPlatformContext({
      platformUserId: ownerId, sessionId: randomUUID(), role: "platform_owner",
      requestId: `voice-control-${randomUUID()}`, reauthenticatedAt: new Date(),
    });
    const support = createPlatformContext({
      platformUserId: supportId, sessionId: randomUUID(), role: "platform_support",
      requestId: `voice-control-${randomUUID()}`, reauthenticatedAt: new Date(),
    });
    const store = new PlatformVoiceOperationsStore(platformClient!);

    await expect(platformClient!`SELECT * FROM platform.voice_runtime_controls`).rejects.toThrow();
    await expect(store.getControl(support)).rejects.toThrow(/platform_voice_operations_required/);
    await expect(store.setControl(owner, { mode: "emergency_stop", reasonCode: "integration_incident" }))
      .resolves.toMatchObject({ mode: "emergency_stop", reasonCode: "integration_incident" });
    await expect(store.setControl(owner, { mode: "running", reasonCode: "integration_recovered" }))
      .resolves.toMatchObject({ mode: "running", reasonCode: "integration_recovered" });
    await expect(store.getControl(owner)).resolves.toMatchObject({ mode: "running" });

    const audits = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform.audit_logs
      WHERE actor_platform_user_id = ${ownerId}::uuid AND action = 'voice.runtime_control_changed'
    `;
    expect(audits[0]?.count).toBe(2);
  });

  it("qualifies and canaries Gen2 with two-person review, incident handling, and guarded rollback", async () => {
    const ownerId = randomUUID();
    const aiOperationsId = randomUUID();
    const financeId = randomUUID();
    const supportId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES
        (${ownerId}::uuid, ${`${ownerId}@example.test`}, 'Advanced Voice owner', 'test-hash', 'active'),
        (${aiOperationsId}::uuid, ${`${aiOperationsId}@example.test`}, 'Advanced Voice reviewer', 'test-hash', 'active'),
        (${financeId}::uuid, ${`${financeId}@example.test`}, 'Advanced Voice finance', 'test-hash', 'active'),
        (${supportId}::uuid, ${`${supportId}@example.test`}, 'Advanced Voice support', 'test-hash', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.role_assignments (platform_user_id, role)
      VALUES (${ownerId}::uuid, 'platform_owner'),
             (${aiOperationsId}::uuid, 'platform_ai_operations'),
             (${financeId}::uuid, 'platform_finance'),
             (${supportId}::uuid, 'platform_support')
    `;
    const context = (platformUserId: string, role: "platform_owner" | "platform_ai_operations" | "platform_finance" | "platform_support") =>
      createPlatformContext({
        platformUserId, sessionId: randomUUID(), role,
        requestId: `voice-routing-${randomUUID()}`, reauthenticatedAt: new Date(),
      });
    const owner = context(ownerId, "platform_owner");
    const reviewer = context(aiOperationsId, "platform_ai_operations");
    const finance = context(financeId, "platform_finance");
    const support = context(supportId, "platform_support");
    const store = new PlatformVoiceOperationsStore(platformClient!);
    const qualificationDigest = "a".repeat(64);
    const evaluationDigest = "b".repeat(64);

    await expect(platformClient!`SELECT * FROM platform.voice_route_candidates`).rejects.toThrow();
    await expect(platformClient!`SELECT * FROM operations.voice_session_routes`).rejects.toThrow();
    await expect(store.getRoutingOverview(support)).rejects.toThrow(/platform_voice_routing_required/);
    await expect(store.getRoutingOverview(finance)).rejects.toThrow(/platform_voice_routing_required/);
    await expect(store.getIncidents(support)).rejects.toThrow(/platform_voice_incident_read_required/);

    const proposal = await store.proposeRouteCandidate(owner, {
      capabilityProfile: "voice_gen2", providerKey: "provider.integration",
      modelKey: "advanced-voice-integration", regionKey: "ap-southeast-1",
    });
    await expect(store.reviewRouteCandidate(owner, {
      candidateId: proposal.candidateId, decision: "qualify", evidenceSha256: qualificationDigest,
    })).rejects.toThrow(/voice_route_review_not_allowed/);
    await expect(store.reviewRouteCandidate(reviewer, {
      candidateId: proposal.candidateId, decision: "qualify", evidenceSha256: qualificationDigest,
    })).resolves.toEqual({ status: "qualified" });

    const requested = await store.requestRoutingChange(owner, {
      capabilityProfile: "voice_gen2", candidateId: proposal.candidateId, canaryPercent: 10,
      reason: "Integration qualification canary", evidenceSha256: evaluationDigest,
    });
    await expect(store.reviewRoutingChange(owner, {
      changeId: requested.changeId, decision: "approve",
    })).rejects.toThrow(/voice_routing_review_not_allowed/);
    await expect(store.reviewRoutingChange(reviewer, {
      changeId: requested.changeId, decision: "approve",
    })).resolves.toEqual({ status: "approved" });
    await expect(store.applyRoutingChange(owner, {
      changeId: requested.changeId, action: "promote", reason: "Cannot skip the reviewed canary",
    })).rejects.toThrow(/voice_routing_change_not_promotable/);
    await expect(store.applyRoutingChange(owner, {
      changeId: requested.changeId, action: "start_canary", reason: "Start the reviewed integration canary",
    })).resolves.toEqual({ status: "canary" });

    const canaryOverview = await store.getRoutingOverview(reviewer);
    expect(canaryOverview.profiles[0]).toMatchObject({
      capabilityProfile: "voice_gen2", mode: "canary",
      canaryCandidateId: proposal.candidateId, canaryPercent: 10,
    });
    expect(canaryOverview.candidates[0]).toMatchObject({
      id: proposal.candidateId, providerKey: "provider.integration",
      modelKey: "advanced-voice-integration", status: "qualified",
    });
    await expect(store.applyRoutingChange(owner, {
      changeId: requested.changeId, action: "promote", reason: "Promote after reviewed canary evidence",
    })).resolves.toEqual({ status: "active" });

    const admission = await store.requestAdmissionChange(owner, {
      enabled: true, reason: "Named merchant media acceptance passed",
      evidenceSha256: "c".repeat(64),
    });
    await expect(store.reviewAdmissionChange(owner, {
      changeId: admission.changeId, decision: "approve",
    })).rejects.toThrow(/voice_admission_independent_review_required/);
    await expect(store.reviewAdmissionChange(reviewer, {
      changeId: admission.changeId, decision: "approve",
    })).resolves.toEqual({ status: "approved" });
    await expect(store.applyAdmissionChange(owner, {
      changeId: admission.changeId,
    })).resolves.toEqual({ status: "applied", enabled: true });
    await expect(store.getRoutingOverview(owner)).resolves.toMatchObject({
      admissionEnabled: true,
      admissionChanges: [expect.objectContaining({
        id: admission.changeId, targetEnabled: true, status: "applied",
      })],
    });

    const incident = await store.openIncident(owner, {
      capabilityProfile: "voice_gen2", severity: "major",
      reason: "Integration route exceeded the quality guardrail",
      routingChangeId: requested.changeId, creditReviewRequired: true,
    });
    await expect(store.reviewIncidentCredit(owner, {
      incidentId: incident.incidentId, decision: "approve",
    })).rejects.toThrow(/voice_incident_credit_not_reviewable/);
    await expect(store.reviewIncidentCredit(finance, {
      incidentId: incident.incidentId, decision: "approve",
    })).resolves.toEqual({ status: "approved" });
    await expect(store.getIncidents(finance)).resolves.toEqual([
      expect.objectContaining({ id: incident.incidentId, creditReviewStatus: "approved" }),
    ]);
    await expect(store.resolveIncident(reviewer, {
      incidentId: incident.incidentId,
      resolution: "Route remains paused pending the explicit rollback",
    })).resolves.toEqual({ status: "resolved" });
    await expect(store.applyRoutingChange(owner, {
      changeId: requested.changeId, action: "rollback",
      reason: "Rollback after integration incident review",
    })).resolves.toEqual({ status: "rolled_back" });

    const finalOverview = await store.getRoutingOverview(owner);
    expect(finalOverview.admissionEnabled).toBe(false);
    expect(finalOverview.profiles[0]).toMatchObject({
      capabilityProfile: "voice_gen2", mode: "paused",
      reasonCode: "routing_change_rolled_back", primaryCandidateId: null,
      canaryCandidateId: null, canaryPercent: 0,
    });
    expect(finalOverview.incidents[0]).toMatchObject({
      id: incident.incidentId, status: "resolved", creditReviewStatus: "approved",
    });
    const audits = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform.audit_logs
      WHERE actor_platform_user_id IN (${ownerId}::uuid, ${aiOperationsId}::uuid, ${financeId}::uuid)
        AND action LIKE 'voice.%'
    `;
    expect(audits[0]?.count).toBe(13);
    const leakedAuditRouting = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform.audit_logs
      WHERE actor_platform_user_id IN (${ownerId}::uuid, ${aiOperationsId}::uuid, ${financeId}::uuid)
        AND (metadata::text ILIKE '%provider.integration%'
          OR metadata::text ILIKE '%advanced-voice-integration%'
          OR reason ILIKE '%provider.integration%'
          OR reason ILIKE '%advanced-voice-integration%')
    `;
    expect(leakedAuditRouting[0]?.count).toBe(0);
  });
});
