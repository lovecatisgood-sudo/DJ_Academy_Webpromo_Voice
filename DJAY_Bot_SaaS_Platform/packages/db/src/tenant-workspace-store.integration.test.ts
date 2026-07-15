import { afterAll, describe, expect, it } from "vitest";
import { createTenantContext } from "@djay/tenancy";
import { createDatabaseClient } from "./client";
import { TenantWorkspaceStore } from "./tenant-workspace-store";

const databaseUrl = process.env.TENANT_DATABASE_URL;
const enabled = Boolean(databaseUrl);
const client = enabled ? createDatabaseClient(databaseUrl!) : null;

afterAll(async () => {
  await client?.end();
});

describe.runIf(enabled)("tenant workspace repository", () => {
  it("reads and updates only the tenant selected by the server context", async () => {
    const store = new TenantWorkspaceStore(client!);
    const tenantA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10",
      userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa11",
      sessionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa13",
      role: "tenant_master_admin",
      requestId: "tenant-store-a",
    });
    const tenantB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10",
      userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11",
      sessionId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb13",
      role: "tenant_master_admin",
      requestId: "tenant-store-b",
    });

    await expect(store.getOnboarding(tenantA)).resolves.toMatchObject({
      tenant_id: tenantA.tenantId,
      business_name: "Tenant A",
      stage: "business_profile",
    });
    await expect(store.getOnboarding(tenantB)).resolves.toMatchObject({
      tenant_id: tenantB.tenantId,
      business_name: "Tenant B",
      stage: "account_created",
    });

    await expect(store.updateOnboarding(tenantA, "product_selection")).resolves.toEqual({
      stage: "product_selection",
    });
    await expect(store.getOnboarding(tenantA)).resolves.toMatchObject({ stage: "product_selection" });
    await expect(store.getOnboarding(tenantB)).resolves.toMatchObject({ stage: "account_created" });

    const teamA = await store.getTeamOverview(tenantA);
    const teamB = await store.getTeamOverview(tenantB);
    expect(teamA.members).toHaveLength(2);
    expect(teamA.members.map((member) => member.email_normalized).sort()).toEqual([
      "admin-a@example.test",
      "owner-a@example.test",
    ]);
    expect(teamB.members).toHaveLength(1);
    expect(teamB.members[0]?.email_normalized).toBe("owner-b@example.test");
    expect(teamB.members.some((member) => member.email_normalized === "owner-a@example.test")).toBe(false);
  });
});
