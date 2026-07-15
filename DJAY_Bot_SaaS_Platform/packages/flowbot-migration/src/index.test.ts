import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { convertLegacyFlowSnapshot, deterministicMigrationId } from "./index";

describe("FlowBot V1 migration adapter", () => {
  it("converts supported deterministic nodes and generates stable keyword IDs", () => {
    const version = randomUUID(); const root = randomUUID(); const end = randomUUID();
    const legacy = { flowVersionId: randomUUID(), rootNodeId: root, nodes: {
      [root]: { id: root, type: "message", title: "Welcome", contentTh: "สวัสดี", contentEn: "Welcome", nextNodeId: end, options: [], config: {} },
      [end]: { id: end, type: "cta_lead_form", title: "Lead", contentTh: "ข้อมูล", contentEn: "Details", options: [], config: {} },
    }, keywords: [{ nodeId: root, keyword: "hello", lang: "en", priority: 100, substringEnabled: true, order: 0 }] };
    const first = convertLegacyFlowSnapshot(legacy, version); const replay = convertLegacyFlowSnapshot(legacy, version);
    expect(first).toMatchObject({ status: "converted" });
    expect(replay).toEqual(first);
  });

  it("quarantines unsupported CTA semantics instead of silently dropping data", () => {
    const root = randomUUID();
    expect(convertLegacyFlowSnapshot({ flowVersionId: randomUUID(), rootNodeId: root, nodes: {
      [root]: { id: root, type: "cta_scheduler", title: "Book", contentTh: "จอง", contentEn: "Book", options: [], config: {} },
    }, keywords: [] }, randomUUID())).toMatchObject({ status: "quarantined", reasonCode: "legacy_node_requires_remediation" });
  });

  it("derives stable tenant-bound target IDs", () => {
    const tenant = randomUUID(); const source = randomUUID();
    expect(deterministicMigrationId(tenant, "bot", source)).toBe(deterministicMigrationId(tenant, "bot", source));
    expect(deterministicMigrationId(randomUUID(), "bot", source)).not.toBe(deterministicMigrationId(tenant, "bot", source));
  });
});
