import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { FlowBotStore } from "./flowbot-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); });

async function provisionFlowbotAuthority(tenantId: string, premium: boolean) {
  const subscriptionId = randomUUID(); const snapshotId = randomUUID();
  const planVersionId = premium ? "62000000-0000-4000-8000-000000000002" : "62000000-0000-4000-8000-000000000001";
  const planKey = premium ? "flowbot_premium" : "flowbot_basic";
  const entitlements = premium ? {
    "channel.web": true, "ai.enabled": false, "flow.nodes.core": true, "flow.nodes.advanced": true,
    "flow.forms": true, "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
    "flow.variables": true, "flow.delays": true, "flow.subflows": true, "flow.business_hours": true,
    "flow.team_routing": true, "flow.webhook": "approved", "branding.remove": true, "analytics.level": "advanced",
  } : {
    "channel.web": true, "ai.enabled": false, "flow.nodes.core": true, "flow.nodes.advanced": false,
    "flow.forms": true, "flow.versioning": true, "flow.lead_capture": true, "flow.email_notification": true,
    "flow.team_routing": "limited", "flow.webhook": false, "branding.remove": false, "analytics.level": "core",
  };
  const limits = { active_bots: premium ? 3 : 1, flow_nodes_per_bot: premium ? 500 : 100, deployments: premium ? 5 : 1 };
  await adminClient!`
    UPDATE tenancy.product_subscriptions
    SET status = 'cancelled', cancelled_at = now()
    WHERE tenant_id = ${tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'
  `;
  await adminClient!`INSERT INTO tenancy.product_subscriptions (id, tenant_id, product_key, plan_version_id, status, period_start, period_end) VALUES (${subscriptionId}::uuid, ${tenantId}::uuid, 'flowbot', ${planVersionId}::uuid, 'active', now(), now() + interval '30 days')`;
  await adminClient!`INSERT INTO tenancy.entitlement_snapshots (id, tenant_id, subscription_id, product_key, plan_version_id, subscription_status, access_mode, resolved_json, resolution_hash) VALUES (${snapshotId}::uuid, ${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', ${planVersionId}::uuid, 'active', 'active', ${adminClient!.json({ tenantId, subscriptionId, productKey: "flowbot", publicPlanKey: planKey, planVersionId, accessMode: "active", entitlements, allowances: { flow_execution: 1000 }, overageRatesMinor: { flow_execution: null }, limits, resolvedAt: new Date().toISOString() })}, digest(${snapshotId}, 'sha256'))`;
  await adminClient!`INSERT INTO tenancy.quota_accounts (tenant_id, subscription_id, product_key, customer_unit, period_start, period_end, included_quantity, safety_cap_quantity) VALUES (${tenantId}::uuid, ${subscriptionId}::uuid, 'flowbot', 'flow_execution', now() - interval '1 minute', now() + interval '30 days', 1000, 1200)`;
  return { subscriptionId, snapshotId };
}

describe.runIf(enabled)("P4 FlowBot authoring repository", () => {
  it("enforces Basic/Premium publishing, immutable rollback, limits, and tenant isolation", async () => {
    const contextA = createTenantContext({ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flowbot-basic" });
    const contextB = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(), role: "tenant_master_admin", requestId: "flowbot-premium" });
    await provisionFlowbotAuthority(contextA.tenantId, false); const premiumAuthority = await provisionFlowbotAuthority(contextB.tenantId, true);
    const store = new FlowBotStore(tenantClient!);
    await expect(store.upsertBusinessSchedule(contextA, {
      scheduleKey: "sales", name: "Sales hours", timezone: "Asia/Bangkok",
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }],
    })).resolves.toEqual({ status: "not_entitled" });
    await expect(store.upsertBusinessSchedule(contextB, {
      scheduleKey: "sales", name: "Sales hours", timezone: "Asia/Bangkok",
      weeklyWindows: [{ dayOfWeek: 1, startMinute: 540, endMinute: 1020 }], closedDates: [],
    })).resolves.toMatchObject({ status: "saved" });
    await expect(store.upsertRoutingTeam(contextB, {
      teamKey: "sales", name: "Sales team", membershipIds: [contextB.membershipId],
    })).resolves.toMatchObject({ status: "saved" });
    expect(await store.listBusinessSchedules(contextB)).toHaveLength(1);
    expect(await store.listRoutingTeams(contextB)).toMatchObject([{ teamKey: "sales", memberIds: [contextB.membershipId] }]);
    const basic = await store.createBot(contextA, { name: "Basic website assistant", defaultLanguage: "en" });
    expect(basic.status).toBe("created"); if (basic.status !== "created") throw new Error("Expected Basic bot.");
    await expect(store.createBot(contextA, { name: "Second Basic bot", defaultLanguage: "en" })).resolves.toEqual({ status: "limit_reached" });
    const draft = await store.getDraft(contextA, basic.botId); expect(draft).toBeTruthy();
    await expect(store.getDraft(contextB, basic.botId)).resolves.toBeNull();
    const premiumNode = randomUUID(); const root = randomUUID();
    await expect(store.updateDraft(contextA, basic.botId, { revision: draft!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "delay", title: "Wait", delaySeconds: 60, nextNodeId: premiumNode },
      [premiumNode]: { id: premiumNode, type: "end", title: "Done" },
    } } })).resolves.toMatchObject({ status: "validation_failed", issues: expect.arrayContaining([expect.objectContaining({ code: "premium_node_not_entitled" })]) });

    const current = await store.getDraft(contextA, basic.botId); const form = randomUUID(); const end = randomUUID();
    await store.updateDraft(contextA, basic.botId, { revision: current!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "message", title: "Welcome", content: { th: "สวัสดี", en: "Welcome" }, nextNodeId: form },
      [form]: { id: form, type: "form", title: "Contact", prompt: { th: "ข้อมูล", en: "Details" }, fields: [{ key: "email", label: { th: "อีเมล", en: "Email" }, type: "email", required: true }], nextNodeId: end },
      [end]: { id: end, type: "end", title: "Done", message: { th: "ขอบคุณ", en: "Thank you" } },
    } } });
    const first = await store.publish(contextA, basic.botId); expect(first.status).toBe("published"); if (first.status !== "published") throw new Error("Expected publish.");
    const deployment = await store.createDeployment(contextA, basic.botId, { name: "Website", allowedOrigins: ["https://merchant.example"] });
    expect(deployment.status).toBe("created");
    if (deployment.status === "created") {
      expect(deployment.deploymentKey).toMatch(/^djay_flow_/);
      const stored = await adminClient!<{ raw_count: number }[]>`SELECT count(*)::int AS raw_count FROM tenancy.flow_deployments WHERE deployment_key_hash = digest(${deployment.deploymentKey}, 'sha256') AND deployment_key_hash::text NOT LIKE ${`%${deployment.deploymentKey}%`}`;
      expect(stored[0]?.raw_count).toBe(1);
      await expect(store.requestInstallCheck(contextA, deployment.deploymentId, "https://merchant.example"))
        .resolves.toMatchObject({ status: "requested" });
      expect(await store.listInstallChecks(contextA, deployment.deploymentId)).toMatchObject([
        { deploymentId: deployment.deploymentId, targetOrigin: "https://merchant.example", status: "requested" },
      ]);
    }
    await expect(store.createDeployment(contextA, basic.botId, { name: "Second website", allowedOrigins: ["https://second.example"] })).resolves.toEqual({ status: "limit_reached" });
    const second = await store.publish(contextA, basic.botId); expect(second.status).toBe("published");
    const rollback = await store.rollback(contextA, basic.botId, first.versionId); expect(rollback).toMatchObject({ status: "published", version: 3 });
    expect(await store.listVersions(contextA, basic.botId)).toHaveLength(3);
    await provisionFlowbotAuthority(contextA.tenantId, true);
    expect(await store.listBots(contextA)).toEqual(expect.arrayContaining([expect.objectContaining({ id: basic.botId })]));
    expect(await store.getDraft(contextA, basic.botId)).toMatchObject({ botId: basic.botId });

    const premiumBot = await store.createBot(contextB, { name: "Premium website assistant", defaultLanguage: "th" });
    expect(premiumBot.status).toBe("created"); if (premiumBot.status !== "created") throw new Error("Expected Premium bot.");
    const premiumDraft = await store.getDraft(contextB, premiumBot.botId);
    const webhookFailure = randomUUID();
    await expect(store.updateDraft(contextB, premiumBot.botId, { revision: premiumDraft!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "webhook", title: "Notify", integrationProfileId: randomUUID(), templateKey: "lead.qualified", nextNodeId: end, failureNodeId: webhookFailure },
      [end]: { id: end, type: "end", title: "Done" },
      [webhookFailure]: { id: webhookFailure, type: "end", title: "Failed" },
    } } })).resolves.toMatchObject({ status: "validation_failed", issues: [{ code: "integration_profile_not_approved", nodeId: root }] });
    await expect(store.updateDraft(contextB, premiumBot.botId, { revision: premiumDraft!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "subflow", title: "Other tenant flow", targetFlowVersionId: first.versionId, returnNodeId: end },
      [end]: { id: end, type: "end", title: "Done" },
    } } })).resolves.toMatchObject({ status: "validation_failed", issues: [{ code: "subflow_version_not_available", nodeId: root }] });
    await expect(store.updateDraft(contextB, premiumBot.botId, { revision: premiumDraft!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "business_hours", title: "Missing schedule", scheduleKey: "missing", timezone: "Asia/Bangkok", openNodeId: end, closedNodeId: end },
      [end]: { id: end, type: "end", title: "Done" },
    } } })).resolves.toMatchObject({ status: "validation_failed", issues: [{ code: "business_schedule_not_available", nodeId: root }] });
    const childBot = await store.createBot(contextB, { name: "Reusable Premium block", defaultLanguage: "th" });
    expect(childBot.status).toBe("created"); if (childBot.status !== "created") throw new Error("Expected child bot.");
    const childDraft = await store.getDraft(contextB, childBot.botId);
    const childRoot = randomUUID(); const childEnd = randomUUID();
    await store.updateDraft(contextB, childBot.botId, { revision: childDraft!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: childRoot, keywords: [], nodes: {
      [childRoot]: { id: childRoot, type: "message", title: "Reusable greeting", content: { th: "สวัสดี", en: "Hello" }, nextNodeId: childEnd },
      [childEnd]: { id: childEnd, type: "end", title: "Return" },
    } } });
    const childVersion = await store.publish(contextB, childBot.botId);
    expect(childVersion.status).toBe("published"); if (childVersion.status !== "published") throw new Error("Expected child publish.");
    await store.updateDraft(contextB, premiumBot.botId, { revision: premiumDraft!.revision, definition: { schemaVersion: 1, flowVersionId: randomUUID(), rootNodeId: root, keywords: [], nodes: {
      [root]: { id: root, type: "subflow", title: "Use reusable block", targetFlowVersionId: childVersion.versionId, returnNodeId: end },
      [end]: { id: end, type: "end", title: "Done" },
    } } });
    const parentVersion = await store.publish(contextB, premiumBot.botId);
    expect(parentVersion).toMatchObject({ status: "published" });
    if (parentVersion.status !== "published") throw new Error("Expected parent publish.");
    const compiled = await adminClient!<{ snapshot_json: { embeddedSubflows?: Record<string, unknown> } }[]>`
      SELECT snapshot_json FROM tenancy.flow_versions
      WHERE tenant_id = ${contextB.tenantId}::uuid AND id = ${parentVersion.versionId}::uuid
    `;
    expect(compiled[0]?.snapshot_json.embeddedSubflows?.[childVersion.versionId]).toBeTruthy();

    const contactId = randomUUID(); const conversationId = randomUUID(); const actionId = randomUUID();
    const handoverKey = `handover-team:${conversationId}`;
    await adminClient!`INSERT INTO tenancy.contacts (id, tenant_id, display_name) VALUES (${contactId}::uuid, ${contextB.tenantId}::uuid, 'Routing visitor')`;
    await adminClient!`
      INSERT INTO tenancy.conversations (id, tenant_id, contact_id, product_key, public_plan_key, entitlement_snapshot_id, channel_kind, automation_mode)
      VALUES (${conversationId}::uuid, ${contextB.tenantId}::uuid, ${contactId}::uuid, 'flowbot', 'flowbot_premium', ${premiumAuthority.snapshotId}::uuid, 'web', 'flowbot')
    `;
    await adminClient!`
      INSERT INTO tenancy.action_requests (id, tenant_id, conversation_id, entitlement_snapshot_id, action_type, input_json, idempotency_key, status, completed_at)
      VALUES (${actionId}::uuid, ${contextB.tenantId}::uuid, ${conversationId}::uuid, ${premiumAuthority.snapshotId}::uuid,
        'handover.request', ${adminClient!.json({ type: "handover.request", payload: { teamKey: "sales", strategy: "least_active" } })},
        ${handoverKey}, 'succeeded', now())
    `;
    await adminClient!`
      INSERT INTO tenancy.handover_events (tenant_id, conversation_id, event_type, reason, idempotency_key)
      VALUES (${contextB.tenantId}::uuid, ${conversationId}::uuid, 'requested', 'flowbot_team_route', ${handoverKey})
    `;
    const routed = await adminClient!<{ automation_mode: string; assigned_membership_id: string; transitions: number }[]>`
      SELECT conversation.automation_mode, conversation.assigned_membership_id,
        (SELECT count(*)::int FROM tenancy.conversation_transitions transition
         WHERE transition.tenant_id = conversation.tenant_id AND transition.conversation_id = conversation.id) AS transitions
      FROM tenancy.conversations conversation
      WHERE conversation.tenant_id = ${contextB.tenantId}::uuid AND conversation.id = ${conversationId}::uuid
    `;
    expect(routed[0]).toEqual({ automation_mode: "human", assigned_membership_id: contextB.membershipId, transitions: 1 });

    const preflight = await store.downgradePreflight(contextB);
    expect(preflight).toMatchObject({ destinationPlanKey: "flowbot_basic", allowed: false });
    expect(preflight?.blockers).toEqual(expect.arrayContaining([expect.objectContaining({ code: "premium_node_present" })]));

    await adminClient!`UPDATE tenancy.product_subscriptions SET status = 'cancelled', cancelled_at = now() WHERE tenant_id = ${contextB.tenantId}::uuid AND product_key = 'flowbot' AND status <> 'cancelled'`;
    const cancelledDraft = await store.getDraft(contextB, premiumBot.botId);
    await expect(store.updateDraft(contextB, premiumBot.botId, {
      revision: cancelledDraft!.revision,
      definition: cancelledDraft!.definition,
    })).resolves.toEqual({ status: "not_entitled" });
  });
});
