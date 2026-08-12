import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { SharedDomainStore } from "./shared-domain-store";

const tenantUrl = process.env.TENANT_DATABASE_URL; const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl); const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;
afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("tenant notification center", () => {
  it("deduplicates authoritative events, deep-links safely, isolates tenants, and binds reads to active membership", async () => {
    const contextA = createTenantContext({ tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2", membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: `notice-a-${randomUUID()}` });
    const contextB = createTenantContext({ tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1", membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: randomUUID(), role: "tenant_master_admin", requestId: `notice-b-${randomUUID()}` });
    await adminClient!`UPDATE tenancy.tenant_onboarding
      SET stage = 'business_profile', updated_at = now()
      WHERE tenant_id = ${contextA.tenantId}::uuid`;
    await adminClient!`INSERT INTO tenancy.ownership_transfers (
        id, tenant_id, from_membership_id, to_membership_id, status, expires_at
      ) VALUES (
        ${randomUUID()}::uuid, ${contextA.tenantId}::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12'::uuid,
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11'::uuid,
        'pending', now() + interval '1 day'
      )`;
    const store = new SharedDomainStore(tenantClient!); const noticesA = await store.listTenantNotifications(contextA);
    expect(noticesA.length).toBeGreaterThan(3);
    expect(new Set(noticesA.map((notice) => notice.id)).size).toBe(noticesA.length);
    expect(noticesA.every((notice) => notice.deepLink.startsWith("/workspace"))).toBe(true);
    expect(noticesA.some((notice) => notice.category === "action_needed")).toBe(true);
    expect(noticesA.some((notice) => notice.category === "completed")).toBe(true);
    for (const sourceFamily of ["onboarding.", "deployment.flowbot_", "deployment.ai_chat_", "deployment.voice_",
      "privacy.", "team.ownership_", "support_access."]) {
      expect(noticesA.some((notice) => notice.eventKind.startsWith(sourceFamily)), sourceFamily).toBe(true);
    }
    const target = noticesA.find((notice) => !notice.read)!; expect(target).toBeTruthy();
    await expect(store.markTenantNotificationRead(contextB, target.id)).resolves.toEqual({ status: "not_found" });
    await expect(store.markTenantNotificationRead(contextA, target.id)).resolves.toEqual({ status: "accepted" });
    await expect(store.markTenantNotificationRead(contextA, target.id)).resolves.toEqual({ status: "accepted" });
    expect((await store.listTenantNotifications(contextA)).find((notice) => notice.id === target.id)?.read).toBe(true);
    const revoked = createTenantContext({ tenantId: contextA.tenantId, userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11", sessionId: randomUUID(), role: "tenant_admin", requestId: randomUUID() });
    await expect(store.markTenantNotificationRead(revoked, target.id)).resolves.toEqual({ status: "not_found" });
    await expect(adminClient!`UPDATE tenancy.tenant_notifications SET severity = 'info' WHERE id = ${target.id}::uuid`).rejects.toThrow(/immutable/i);
  });
});
