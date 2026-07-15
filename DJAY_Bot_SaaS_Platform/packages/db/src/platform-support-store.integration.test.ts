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
