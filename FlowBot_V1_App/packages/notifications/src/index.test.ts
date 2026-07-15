import { describe, expect, it } from "vitest";
import { TestNotificationProvider } from "./index";

describe("test notification provider", () => {
  it("records sent payloads without calling an external provider", async () => {
    const provider = new TestNotificationProvider();
    await provider.send({ kind: "handoff", tenantId: "tenant-1", conversationId: "conversation-1" });

    expect(provider.sent).toEqual([{ kind: "handoff", tenantId: "tenant-1", conversationId: "conversation-1" }]);
  });
});
