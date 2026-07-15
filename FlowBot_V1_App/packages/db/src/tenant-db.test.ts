import { describe, expect, it } from "vitest";
import { tenantDb } from "./tenant-db";

function fakeSql(calls: string[]) {
  return ((strings: TemplateStringsArray, ...values: unknown[]) => {
    calls.push(`${strings.join("?")} ${JSON.stringify(values)}`.trim());
    return Promise.resolve([]);
  }) as never;
}

describe("tenantDb", () => {
  it("sets transaction-local tenant context before work", async () => {
    const calls: string[] = [];
    const result = await tenantDb(
      "tenant-1",
      async (tx) => {
        expect(tx.tenantId).toBe("tenant-1");
        return "ok";
      },
      fakeSql(calls)
    );

    expect(result).toBe("ok");
    expect(calls[0]).toContain("BEGIN");
    expect(calls[1]).toContain("set_config('app.tenant_id'");
    expect(calls[1]).toContain("tenant-1");
    expect(calls.at(-1)).toContain("COMMIT");
  });

  it("rolls back on failure", async () => {
    const calls: string[] = [];

    await expect(
      tenantDb(
        "tenant-1",
        async () => {
          throw new Error("boom");
        },
        fakeSql(calls)
      )
    ).rejects.toThrow("boom");

    expect(calls.at(-1)).toContain("ROLLBACK");
  });
});
