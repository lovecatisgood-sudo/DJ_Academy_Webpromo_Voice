import { describe, expect, it } from "vitest";
import { GET } from "./route";

describe("live health route", () => {
  it("returns a live response", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, status: "live" });
  });
});
