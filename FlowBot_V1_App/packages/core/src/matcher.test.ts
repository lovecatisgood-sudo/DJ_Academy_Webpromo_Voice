import { describe, expect, it } from "vitest";
import { matchKeyword } from "./matcher";

describe("deterministic keyword matcher", () => {
  const candidates = [
    { nodeId: "price", keyword: "ราคา", lang: "th" as const, priority: 100, substringEnabled: true, order: 1 },
    { nodeId: "appointment", keyword: "appointment", lang: "en" as const, priority: 100, substringEnabled: true, order: 2 },
    { nodeId: "price-en", keyword: "price", lang: "en" as const, priority: 100, substringEnabled: true, order: 3 }
  ];

  it("matches exact Thai keyword", () => {
    expect(matchKeyword("ราคา", "th", candidates)).toMatchObject({ kind: "match", nodeId: "price", tier: "exact" });
  });

  it("matches valid Thai substring", () => {
    expect(matchKeyword("อยากทราบราคาจัดฟันค่ะ", "th", candidates)).toMatchObject({
      kind: "match",
      nodeId: "price",
      tier: "contains"
    });
  });

  it("normalizes English punctuation and case", () => {
    expect(matchKeyword("PRICE?", "en", candidates)).toMatchObject({ kind: "match", nodeId: "price-en", tier: "exact" });
  });

  it("does not use keyword-contains-input reverse matching", () => {
    expect(matchKeyword("a", "en", candidates)).toEqual({ kind: "none" });
    expect(matchKeyword("pr", "en", candidates)).toEqual({ kind: "none" });
  });
});
