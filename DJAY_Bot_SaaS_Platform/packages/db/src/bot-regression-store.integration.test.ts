import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { TenantBotRegressionStore } from "./bot-regression-store";
import { createDatabaseClient } from "./client";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("published bot regression evidence", () => {
  it("is immutable, replay-safe, current-version-bound, and tenant-isolated across all bot families", async () => {
    const tenantA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "regression-a",
    });
    const tenantB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: "regression-b",
    });
    const [flow] = await adminClient!<{ subjectId: string; versionId: string }[]>`
      SELECT bot.id AS "subjectId", bot.current_published_version_id AS "versionId"
      FROM tenancy.flow_bots bot WHERE bot.tenant_id = ${tenantA.tenantId}::uuid
        AND bot.current_published_version_id IS NOT NULL ORDER BY bot.updated_at DESC LIMIT 1
    `;
    const [ai] = await adminClient!<{ subjectId: string; versionId: string }[]>`
      SELECT agent.id AS "subjectId", agent.current_published_playbook_version_id AS "versionId"
      FROM tenancy.ai_agents agent JOIN tenancy.ai_deployments deployment
        ON deployment.tenant_id = agent.tenant_id AND deployment.agent_id = agent.id
      WHERE agent.tenant_id = ${tenantA.tenantId}::uuid
        AND agent.current_published_playbook_version_id IS NOT NULL
      ORDER BY agent.updated_at DESC LIMIT 1
    `;
    const [voice] = await adminClient!<{ subjectId: string; versionId: string }[]>`
      SELECT deployment.id AS "subjectId", agent.current_published_playbook_version_id AS "versionId"
      FROM tenancy.voice_deployments deployment JOIN tenancy.ai_agents agent
        ON agent.tenant_id = deployment.tenant_id AND agent.id = deployment.agent_id
      WHERE deployment.tenant_id = ${tenantA.tenantId}::uuid
        AND agent.current_published_playbook_version_id IS NOT NULL
      ORDER BY deployment.updated_at DESC LIMIT 1
    `;
    expect(flow).toBeTruthy(); expect(ai).toBeTruthy(); expect(voice).toBeTruthy();
    if (!flow || !ai || !voice) throw new Error("Expected published bot fixtures.");

    const store = new TenantBotRegressionStore(tenantClient!);
    const replayKey = randomUUID();
    const flowInput = { productKey: "flowbot" as const, subjectId: flow.subjectId,
      artifactVersionId: flow.versionId, suiteKey: "published_smoke" as const, locale: "th" as const,
      checks: { production_engine_completed: true, external_side_effects_suppressed: true }, idempotencyKey: replayKey };
    const recorded = await store.record(tenantA, flowInput);
    expect(recorded).toMatchObject({ status: "recorded" });
    await expect(store.record(tenantA, flowInput)).resolves.toEqual(recorded);
    await expect(store.record(tenantB, { ...flowInput, idempotencyKey: randomUUID() }))
      .resolves.toEqual({ status: "not_recorded" });
    await expect(store.record(tenantA, { ...flowInput, artifactVersionId: randomUUID(), idempotencyKey: randomUUID() }))
      .resolves.toEqual({ status: "not_recorded" });

    await expect(store.record(tenantA, { productKey: "ai_chat", subjectId: ai.subjectId,
      artifactVersionId: ai.versionId, suiteKey: "merchant_scenario", locale: "en",
      checks: { response_generated: true, grounding_available: false }, idempotencyKey: randomUUID() }))
      .resolves.toMatchObject({ status: "recorded" });
    const voiceResult = await store.record(tenantA, { productKey: "voice", subjectId: voice.subjectId,
      artifactVersionId: voice.versionId, suiteKey: "completed_voice_session", locale: "th",
      checks: { session_ended: true, usage_settled_exactly_once: true }, idempotencyKey: randomUUID() });
    expect(voiceResult).toMatchObject({ status: "recorded" });

    const runsA = await store.list(tenantA);
    expect(runsA).toEqual(expect.arrayContaining([
      expect.objectContaining({ productKey: "flowbot", artifactVersionId: flow.versionId, status: "passed" }),
      expect.objectContaining({ productKey: "ai_chat", artifactVersionId: ai.versionId, status: "failed" }),
      expect.objectContaining({ productKey: "voice", artifactVersionId: voice.versionId, status: "passed" }),
    ]));
    await expect(store.list(tenantB)).resolves.toEqual([]);
    if (voiceResult.status !== "recorded") throw new Error("Expected voice evidence.");
    await expect(adminClient!`UPDATE tenancy.bot_regression_runs SET status = 'failed'
      WHERE id = ${voiceResult.runId}::uuid`).rejects.toThrow(/immutable/i);
  });
});
