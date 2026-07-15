import { createTenantContext } from "@djay/tenancy";
import type postgres from "postgres";
import { describe, expect, it } from "vitest";
import type { DatabaseClient } from "./client";
import { withTenantTransaction } from "./scoped-transaction";

function fakeClient(events: string[]): DatabaseClient {
  const transactionSql = ((strings: TemplateStringsArray, ...values: unknown[]) => {
    events.push(`${strings.join("?")}|${values.join("|")}`);
    return Promise.resolve([]);
  }) as unknown as postgres.TransactionSql;

  return {
    begin: async <T>(callback: (sql: postgres.TransactionSql) => T | Promise<T>) => callback(transactionSql),
  } as unknown as DatabaseClient;
}

describe("scoped database transaction", () => {
  it("sets server-authenticated tenant and actor context before repository work", async () => {
    const events: string[] = [];
    const context = createTenantContext({
      tenantId: "11111111-1111-4111-8111-111111111111",
      userId: "22222222-2222-4222-8222-222222222222",
      membershipId: "33333333-3333-4333-8333-333333333333",
      sessionId: "44444444-4444-4444-8444-444444444444",
      role: "tenant_master_admin",
      requestId: "request-tenant-1",
    });

    const result = await withTenantTransaction(fakeClient(events), context, async (transaction) => {
      events.push(`operation:${transaction.context.tenantId}`);
      expect(Object.isFrozen(transaction)).toBe(true);
      return "done";
    });

    expect(result).toBe("done");
    expect(events).toHaveLength(2);
    expect(events[0]).toContain("set_config('app.tenant_id'");
    expect(events[0]).toContain(context.tenantId);
    expect(events[0]).toContain(context.membershipId);
    expect(events[1]).toBe(`operation:${context.tenantId}`);
  });
});

