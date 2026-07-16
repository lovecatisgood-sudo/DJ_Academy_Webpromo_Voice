import { describe, expect, it } from "vitest";
import { DatabaseReadinessProbe, type DatabaseClient } from "./client";

function deferred() {
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<void>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });
  return { promise, resolve, reject };
}

describe("database readiness probe", () => {
  it("shares one outstanding query across concurrent checks", async () => {
    const query = deferred();
    let queryCount = 0;
    const client = (() => {
      queryCount += 1;
      return query.promise;
    }) as unknown as DatabaseClient;
    const probe = new DatabaseReadinessProbe(client);
    const first = probe.check(500);
    const second = probe.check(500);
    await Promise.resolve();
    expect(queryCount).toBe(1);
    query.resolve();
    await expect(Promise.all([first, second])).resolves.toEqual([
      expect.objectContaining({ status: "ready" }),
      expect.objectContaining({ status: "ready" }),
    ]);
  });

  it("does not enqueue another query while a timed-out probe is still pending", async () => {
    const query = deferred();
    let queryCount = 0;
    const client = (() => {
      queryCount += 1;
      return query.promise;
    }) as unknown as DatabaseClient;
    const probe = new DatabaseReadinessProbe(client);
    await expect(probe.check(50)).resolves.toMatchObject({
      status: "unavailable", reason: "timeout",
    });
    await expect(probe.check(50)).resolves.toMatchObject({
      status: "unavailable", reason: "timeout",
    });
    expect(queryCount).toBe(1);
    query.resolve();
  });
});
