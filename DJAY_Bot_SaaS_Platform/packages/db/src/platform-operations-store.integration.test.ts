import { createHash, randomUUID } from "node:crypto";
import { createPlatformContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import {
  operationalAttestationKinds,
  operationalServiceKeys,
  PlatformOperationsStore,
} from "./platform-operations-store";

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(platformUrl && adminUrl);
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await platformClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("P9 release readiness operations", () => {
  it("ingests immutable evidence, fails closed, and publishes only safe status", async () => {
    const platformUserId = randomUUID();
    await adminClient!`
      INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status)
      VALUES (${platformUserId}::uuid, ${`operations-${platformUserId}@example.test`},
              'Release Operator', 'not-used', 'active')
    `;
    await adminClient!`
      INSERT INTO platform.role_assignments (platform_user_id, role)
      VALUES (${platformUserId}::uuid, 'platform_owner')
    `;
    const context = createPlatformContext({
      platformUserId, sessionId: randomUUID(), role: "platform_owner",
      requestId: "p9-release-readiness", reauthenticatedAt: new Date(),
    });
    const store = new PlatformOperationsStore(platformClient!);
    const now = new Date();
    const initial = await store.readinessOverview(context, "staging", now);
    expect(initial).toMatchObject({ status: "blocked", environment: "staging" });
    expect(initial.services).toHaveLength(7);
    expect(initial.services.every((service) => service.status === "missing")).toBe(true);
    expect(initial.attestations).toHaveLength(9);

    for (const environment of ["staging", "production"] as const) {
      for (const [index, serviceKey] of operationalServiceKeys.entries()) {
        const evidenceSha256 = createHash("sha256").update(`${environment}:${serviceKey}:passing`).digest();
        const input = {
          environment, serviceKey,
          windowStart: new Date(now.getTime() - 24 * 60 * 60 * 1000), windowEnd: now,
          sampleCount: 2_000, successfulCount: 2_000, latencyP95Ms: 500 + index,
          queueAgeSeconds: serviceKey === "public_site" || serviceKey === "tenant_api"
            || serviceKey === "voice_gateway" ? null : 0,
          deadLetterCount: 0, evidenceSha256,
          sourceReference: `monitor:${environment}:${serviceKey}`, requestId: `observe-${environment}-${serviceKey}`, now,
        };
        await expect(store.ingestObservation(input)).resolves.toMatchObject({ status: "recorded" });
        await expect(store.ingestObservation(input)).resolves.toEqual({ status: "replayed" });
      }
    }
    for (const attestationKind of operationalAttestationKinds) {
      await expect(store.ingestAttestation({
        environment: "staging", attestationKind, status: "passed",
        validFrom: new Date(now.getTime() - 60 * 60 * 1000),
        validUntil: new Date(now.getTime() + 24 * 60 * 60 * 1000),
        evidenceSha256: createHash("sha256").update(`staging:${attestationKind}`).digest(),
        sourceReference: `operations:staging:${attestationKind}`,
        requestId: `attest-${attestationKind}`, now,
      })).resolves.toMatchObject({ status: "recorded" });
    }

    const ready = await store.readinessOverview(context, "staging", now);
    expect(ready).toMatchObject({
      status: "ready",
      incidents: { passing: true, blocking: 0 },
    });
    expect(ready.services.every((service) => service.passing)).toBe(true);
    expect(ready.attestations.every((attestation) => attestation.passing)).toBe(true);
    await expect(store.publicStatus(now)).resolves.toMatchObject({ overall: "operational" });

    const failingEvidence = createHash("sha256").update("production:ai_chat_runtime:failing").digest();
    await store.ingestObservation({
      environment: "production", serviceKey: "ai_chat_runtime",
      windowStart: new Date(now.getTime() - 24 * 60 * 60 * 1000),
      windowEnd: new Date(now.getTime() + 1_000), sampleCount: 2_000,
      successfulCount: 1_000, latencyP95Ms: 12_000, queueAgeSeconds: 600,
      deadLetterCount: 2, evidenceSha256: failingEvidence,
      sourceReference: "monitor:production:ai_chat_runtime:incident",
      requestId: "observe-production-ai-failing", now,
    });
    const publicStatus = await store.publicStatus(new Date(now.getTime() + 2_000));
    expect(publicStatus.overall).toBe("outage");
    expect(publicStatus.services.find((service) => service.label === "AI conversations"))
      .toMatchObject({ label: "AI conversations", status: "outage" });
    expect(JSON.stringify(publicStatus)).not.toMatch(/provider|model|route|cost|tenant|reference/i);

    await expect(adminClient!`
      UPDATE platform.service_level_observations SET successful_count = sample_count
      WHERE evidence_sha256 = ${failingEvidence}
    `).rejects.toThrow(/immutable/);
    const audit = await adminClient!<{ count: number }[]>`
      SELECT count(*)::int AS count FROM platform.audit_logs
      WHERE action IN ('operations.slo_observation.recorded', 'operations.attestation.recorded')
        AND created_at >= ${new Date(now.getTime() - 1_000)}
    `;
    expect(audit[0]?.count).toBe(24);
  });
});
