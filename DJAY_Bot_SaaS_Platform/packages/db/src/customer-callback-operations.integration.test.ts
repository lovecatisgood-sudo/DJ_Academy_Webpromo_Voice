import { randomUUID } from "node:crypto";
import { createTenantContext } from "@djay/tenancy";
import { afterAll, describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { SharedDomainStore } from "./shared-domain-store";

const tenantUrl = process.env.TENANT_DATABASE_URL;
const adminUrl = process.env.ADMIN_DATABASE_URL;
const enabled = Boolean(tenantUrl && adminUrl);
const tenantClient = enabled ? createDatabaseClient(tenantUrl!) : null;
const adminClient = enabled ? createDatabaseClient(adminUrl!) : null;

afterAll(async () => { await tenantClient?.end(); await adminClient?.end(); });

describe.runIf(enabled)("customer callback operations", () => {
  it("orders due work, appends status history, rejects stale transitions, and isolates tenants", async () => {
    const contextA = createTenantContext({
      tenantId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa10", userId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
      membershipId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaa12", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: `callback-a-${randomUUID()}`,
    });
    const contextB = createTenantContext({
      tenantId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb10", userId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
      membershipId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbb11", sessionId: randomUUID(),
      role: "tenant_master_admin", requestId: `callback-b-${randomUUID()}`,
    });
    const store = new SharedDomainStore(tenantClient!);
    const callbacks = await store.listCallbacks(contextA);
    expect(callbacks.length).toBeGreaterThan(0);
    const pending = callbacks.find((callback) => callback.status === "pending");
    expect(pending).toBeTruthy();
    if (!pending) throw new Error("Voice runtime callback fixture is missing.");
    expect(pending.history).toMatchObject([{ fromStatus: null, toStatus: "pending" }]);
    await expect(store.listCallbacks(contextB)).resolves.not.toContainEqual(expect.objectContaining({ id: pending.id }));
    await expect(store.updateCallback(contextB, pending.id, "completed")).resolves.toEqual({ status: "not_found" });
    await expect(store.updateCallback(contextA, pending.id, "completed")).resolves.toEqual({ status: "accepted", replayed: false });
    await expect(store.updateCallback(contextA, pending.id, "completed")).resolves.toEqual({ status: "accepted", replayed: true });
    await expect(store.updateCallback(contextA, pending.id, "cancelled")).resolves.toEqual({ status: "invalid_transition" });
    const completed = (await store.listCallbacks(contextA)).find((callback) => callback.id === pending.id);
    expect(completed).toMatchObject({ status: "completed" });
    expect(completed?.history).toMatchObject([
      { fromStatus: null, toStatus: "pending" }, { fromStatus: "pending", toStatus: "completed" },
    ]);
    const historyId = completed?.history.at(-1)?.id;
    expect(historyId).toBeTruthy();
    await expect(adminClient!`DELETE FROM tenancy.voice_callback_status_history WHERE id = ${historyId!}::uuid`).rejects.toThrow(/immutable/i);
  });
});
