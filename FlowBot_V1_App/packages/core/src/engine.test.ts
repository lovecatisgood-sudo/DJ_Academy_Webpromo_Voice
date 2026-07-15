import type { FlowSnapshot } from "@flowbot/shared";
import { describe, expect, it } from "vitest";
import { advance } from "./engine";

const rootNodeId = "11111111-1111-4111-8111-111111111111";
const priceNodeId = "22222222-2222-4222-8222-222222222222";

const snapshot: FlowSnapshot = {
  flowVersionId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  rootNodeId,
  nodes: {
    [rootNodeId]: {
      id: rootNodeId,
      type: "message",
      title: "Root",
      contentTh: "สวัสดีครับ",
      contentEn: "Hi",
      options: [],
      config: {}
    },
    [priceNodeId]: {
      id: priceNodeId,
      type: "message",
      title: "Pricing",
      contentTh: "ราคาเริ่มต้นขึ้นอยู่กับแพ็กเกจครับ",
      contentEn: "Pricing depends on the package.",
      options: [],
      config: {}
    }
  },
  keywords: [
    {
      nodeId: priceNodeId,
      keyword: "pricing",
      lang: "en",
      priority: 100,
      substringEnabled: true,
      order: 0
    }
  ]
};

describe("conversation engine", () => {
  it("routes clear text input to a matching keyword node", async () => {
    const result = await advance(
      {
        tenantId: "tenant",
        botId: "bot",
        conversation: {
          id: "conversation",
          flowVersionId: snapshot.flowVersionId,
          currentNodeId: rootNodeId,
          status: "bot",
          lang: "en"
        },
        config: { snapshot }
      },
      { type: "text", payload: { text: "Can you share pricing?" } }
    );

    expect(result.stateUpdates).toMatchObject({ currentNodeId: priceNodeId });
    expect(result.messages).toEqual([{ type: "text", content: { text: "Pricing depends on the package." } }]);
    expect(result.events).toEqual([
      {
        type: "keyword_match",
        payload: { keyword: "pricing", nodeId: priceNodeId, tier: "contains" }
      }
    ]);
    expect(result.effects).toEqual([]);
  });

  it("falls back to handoff when no keyword matches", async () => {
    const result = await advance(
      {
        tenantId: "tenant",
        botId: "bot",
        conversation: {
          id: "conversation",
          flowVersionId: snapshot.flowVersionId,
          currentNodeId: rootNodeId,
          status: "bot",
          lang: "en"
        },
        config: { snapshot }
      },
      { type: "text", payload: { text: "Something else" } }
    );

    expect(result.stateUpdates).toMatchObject({ status: "awaiting_admin" });
    expect(result.events.map((event) => event.type)).toEqual(["keyword_miss", "fallback"]);
    expect(result.effects).toEqual([{ type: "request_handoff", payload: { reason: "keyword_miss" } }]);
  });
});
