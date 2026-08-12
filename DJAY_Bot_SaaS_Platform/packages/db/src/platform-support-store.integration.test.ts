import { randomUUID } from "node:crypto";
import { createPlatformContext, createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { PlatformSupportStore } from "./platform-support-store";
import { SharedDomainStore } from "./shared-domain-store";

const platformUrl = process.env.PLATFORM_DATABASE_URL;
const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(platformUrl && tenantUrl && adminUrl);
const platformClient = enabled ? createDatabaseClient(platformUrl!) : null;
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await platformClient?.end(); await tenantClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("P3 platform support grants", () => {
  it("tracks tenant-linked incidents with guarded transitions, immutable history, and role denial", async () => {
    const owner = (await adminClient!<{ id: string }[]>`SELECT id FROM platform.users WHERE status = 'active' ORDER BY created_at LIMIT 1`)[0];
    expect(owner).toBeTruthy();
    const supportUserId = randomUUID();
    const financeUserId = randomUUID();
    await adminClient!`INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status) VALUES
      (${supportUserId}::uuid, ${`incident-support-${supportUserId}@example.test`}, 'Incident Support', 'not-used-in-test', 'active'),
      (${financeUserId}::uuid, ${`incident-finance-${financeUserId}@example.test`}, 'Incident Finance', 'not-used-in-test', 'active')`;
    await adminClient!`INSERT INTO platform.role_assignments (platform_user_id, role, granted_by_user_id) VALUES
      (${supportUserId}::uuid, 'platform_support', ${owner!.id}::uuid),
      (${financeUserId}::uuid, 'platform_finance', ${owner!.id}::uuid)`;
    const store = new PlatformSupportStore(platformClient!);
    const support = createPlatformContext({ platformUserId: supportUserId, sessionId: randomUUID(), role: "platform_support", requestId: "incident-open", reauthenticatedAt: new Date() });
    const idempotencyKey = randomUUID();
    const openInput = { tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", category: "deployment", severity: "major", affectedProduct: "flowbot", summary: "Published widget cannot start for this tenant.", idempotencyKey };
    const opened = await store.openIncident(support, openInput);
    await expect(store.openIncident(support, openInput)).resolves.toEqual(opened);
    await expect(store.openIncident(support, { ...openInput, summary: "Conflicting retry must never open another incident." })).rejects.toThrow(/idempotency_conflict/);
    const all = await store.incidentBoard(support, {});
    expect(all.tenants).toEqual(expect.arrayContaining([expect.objectContaining({ id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", businessName: "Tenant A" })]));
    expect(all.incidents).toEqual(expect.arrayContaining([expect.objectContaining({ id: opened.incidentId, tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", status: "open", history: [expect.objectContaining({ toStatus: "open" })] })]));
    await expect(store.incidentBoard(support, { tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10" })).resolves.toMatchObject({ incidents: [] });
    await expect(store.transitionIncident(support, { incidentId: opened.incidentId, status: "resolved", note: "Tried to skip the required investigation state." })).rejects.toThrow(/transition_not_allowed/);
    await expect(store.assignIncident(support, { incidentId: opened.incidentId, ownerPlatformUserId: owner!.id, note: "Escalated ownership to the platform owner for coordinated response." })).resolves.toEqual({ status: "assigned", ownerPlatformUserId: owner!.id });
    await expect(store.assignIncident(support, { incidentId: opened.incidentId, ownerPlatformUserId: owner!.id, note: "Duplicate assignment must fail without another history row." })).rejects.toThrow(/assignment_not_allowed/);
    await expect(store.transitionIncident(support, { incidentId: opened.incidentId, status: "investigating", note: "Reproduced failure and isolated the affected deployment." })).resolves.toEqual({ status: "investigating" });
    await expect(store.transitionIncident(support, { incidentId: opened.incidentId, status: "monitoring", note: "Applied the correction and started bounded health monitoring." })).resolves.toEqual({ status: "monitoring" });
    await expect(store.transitionIncident(support, { incidentId: opened.incidentId, status: "resolved", note: "Monitoring remained healthy and the tenant deployment recovered." })).resolves.toEqual({ status: "resolved" });
    const closed = await store.incidentBoard(support, { status: "resolved" });
    expect(closed.incidents[0]).toMatchObject({ id: opened.incidentId, status: "resolved" });
    expect((closed.incidents[0] as { history: unknown[] }).history).toHaveLength(5);
    await expect(adminClient!`UPDATE platform.tenant_incident_history SET note = 'mutated evidence' WHERE incident_id = ${opened.incidentId}::uuid`).rejects.toThrow(/immutable/);
    const finance = createPlatformContext({ platformUserId: financeUserId, sessionId: randomUUID(), role: "platform_finance", requestId: "incident-finance-denied", reauthenticatedAt: new Date() });
    await expect(store.incidentBoard(finance, {})).rejects.toThrow(/incident_read_required/);
    const audit = await adminClient!<{ action: string }[]>`SELECT action FROM platform.audit_logs WHERE target_id = ${opened.incidentId} ORDER BY created_at`;
    expect(audit.map((row) => row.action)).toEqual(["tenant_incident.opened", "tenant_incident.assigned", "tenant_incident.transitioned", "tenant_incident.transitioned", "tenant_incident.transitioned"]);
  });

  it("returns an audited, bounded Tenant 360 only to tenant-reading platform roles", async () => {
    const owner = (await adminClient!<{ id: string }[]>`SELECT id FROM platform.users WHERE status = 'active' ORDER BY created_at LIMIT 1`)[0];
    expect(owner).toBeTruthy();
    const store = new PlatformSupportStore(platformClient!);
    const ownerContext = createPlatformContext({ platformUserId: owner!.id, sessionId: randomUUID(), role: "platform_owner", requestId: "tenant-360-owner", reauthenticatedAt: new Date() });
    const overview = await store.tenant360(ownerContext, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10") as Record<string, unknown>;
    expect(overview).toMatchObject({ tenant: { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", businessName: "Tenant A" } });
    expect(Array.isArray(overview.subscriptions)).toBe(true);
    expect(Array.isArray(overview.deployments)).toBe(true);
    const serialized = JSON.stringify(overview);
    for (const forbidden of ["passwordHash", "deploymentKeyHash", "resolvedJson", "scopeJson", "providerKey", "modelKey"]) {
      expect(serialized).not.toContain(forbidden);
    }
    await expect(store.tenant360(ownerContext, "cccccccc-cccc-4ccc-8ccc-cccccccccccc")).resolves.toBeNull();

    const aiUserId = randomUUID();
    await adminClient!`INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status) VALUES (${aiUserId}::uuid, ${`ai-${aiUserId}@example.test`}, 'AI Operator', 'not-used-in-test', 'active')`;
    await adminClient!`INSERT INTO platform.role_assignments (platform_user_id, role, granted_by_user_id) VALUES (${aiUserId}::uuid, 'platform_ai_operations', ${owner!.id}::uuid)`;
    const aiContext = createPlatformContext({ platformUserId: aiUserId, sessionId: randomUUID(), role: "platform_ai_operations", requestId: "tenant-360-denied", reauthenticatedAt: new Date() });
    await expect(store.tenant360(aiContext, "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10")).rejects.toThrow();
    const audits = await adminClient!<{ action: string }[]>`SELECT action FROM platform.audit_logs WHERE action = 'tenant_360.viewed' AND target_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10'`;
    expect(audits).toHaveLength(1);
  });

  it("requires a different approver, limits time, exposes active access, and audits revocation", async () => {
    const owners = await adminClient!<{ id: string }[]>`
      SELECT app_user.id FROM platform.users app_user JOIN platform.role_assignments assignment
        ON assignment.platform_user_id = app_user.id AND assignment.role = 'platform_owner' AND assignment.revoked_at IS NULL
      LIMIT 1
    `;
    expect(owners[0]).toBeTruthy();
    const supportUserId = randomUUID();
    await adminClient!`INSERT INTO platform.users (id, email_normalized, display_name, password_hash, status) VALUES (${supportUserId}::uuid, ${`support-${supportUserId}@example.test`}, 'Support Operator', 'not-used-in-test', 'active')`;
    await adminClient!`INSERT INTO platform.role_assignments (platform_user_id, role, granted_by_user_id) VALUES (${supportUserId}::uuid, 'platform_support', ${owners[0]!.id}::uuid)`;
    const supportContext = createPlatformContext({ platformUserId: supportUserId, sessionId: randomUUID(), role: "platform_support", requestId: "support-request", reauthenticatedAt: new Date() });
    const ownerContext = createPlatformContext({ platformUserId: owners[0]!.id, sessionId: randomUUID(), role: "platform_owner", requestId: "support-approve", reauthenticatedAt: new Date() });
    const store = new PlatformSupportStore(platformClient!);
    const request = await store.requestGrant(supportContext, { tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", reason: "Investigate a merchant-reported inbox delivery issue.", durationMinutes: 60 });
    expect(request.status).toBe("requested");
    if (request.status !== "requested") throw new Error("Expected support grant request.");
    await expect(store.approveGrant(supportContext, request.grantId)).resolves.toEqual({ status: "not_approvable" });
    await expect(store.approveGrant(ownerContext, request.grantId)).resolves.toEqual({ status: "active" });

    const tenantContext = createTenantContext({ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(), role: "tenant_master_admin", requestId: "support-banner" });
    const shared = new SharedDomainStore(tenantClient!);
    await expect(shared.listActiveSupportAccess(tenantContext)).resolves.toMatchObject([{ id: request.grantId }]);
    await expect(store.revokeGrant(ownerContext, request.grantId)).resolves.toEqual({ status: "revoked" });
    await expect(shared.listActiveSupportAccess(tenantContext)).resolves.toEqual([]);
    const audit = await adminClient!<{ action: string }[]>`
      SELECT action FROM platform.audit_logs WHERE target_id = ${request.grantId} ORDER BY created_at
    `;
    expect(audit.map((row) => row.action)).toEqual(["support_access.requested", "support_access.approved", "support_access.revoked"]);
  });
});
