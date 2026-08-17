import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { convertClaimedBuilderFlow, convertLegacyFlowSnapshot, deterministicMigrationId } from "./index";

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

describe("claimed Builder Flow adapter", () => {
  it("preserves bilingual paths, forms, handover, keywords, and canvas positions deterministically", () => {
    const version = randomUUID();
    const input = {
      schemaVersion: 1, locale: "en", family: "flow",
      configuration: { flowDraft: {
        template: "lead",
        identity: { botName: "Claimed Flow Bot", languageMode: "customer-choice",
          greetingEn: "Welcome", greetingTh: "ยินดีต้อนรับ", brandColor: "#126149", position: "Bottom left",
          businessHours: "Monday-Friday 09:00-17:00", handoverContact: "Shared inbox", privacyUrl: "https://example.test/privacy" },
        lead: { fields: [{ label: "Contact", type: "email", required: true }, { label: "Contact", type: "tel", required: false }], consent: "I agree to follow-up." },
        handover: { team: "Shared inbox", fallbackEn: "A person can help.", fallbackTh: "ทีมงานช่วยได้", outsideHours: "We will reply during business hours." },
        widget: { domain: "https://example.test", openOnLoad: false }, entryId: "welcome",
        nodes: [
          { id: "welcome", type: "options", title: "Welcome", en: "Choose", th: "เลือก", x: 10, y: 20, keywords: ["hello"], next: null,
            options: [{ en: "Contact", th: "ติดต่อ", target: "lead" }, { en: "Person", th: "เจ้าหน้าที่", target: "handover" }], fields: [] },
          { id: "lead", type: "form", title: "Lead", en: "Details", th: "ข้อมูล", x: 30, y: 40, keywords: [], next: "done", options: [],
            fields: [{ label: "Email or phone", type: "tel", required: true }] },
          { id: "handover", type: "handover", title: "Staff", en: "Our team will continue.", th: "ทีมงานจะดูแลต่อ", x: 50, y: 60, keywords: [], next: null, options: [], fields: [] },
          { id: "done", type: "end", title: "Done", en: "Thank you", th: "ขอบคุณ", x: 70, y: 80, keywords: [], next: null, options: [], fields: [] },
        ],
      } },
    };
    const first = convertClaimedBuilderFlow(input, version);
    expect(first).toMatchObject({ status: "converted", botName: "Claimed Flow Bot", defaultLanguage: "en", warnings: [] });
    expect(convertClaimedBuilderFlow(input, version)).toEqual(first);
    if (first.status !== "converted") throw new Error("Expected conversion.");
    expect(Object.values(first.snapshot.nodes).map((node) => node.type).sort()).toEqual(["end", "form", "handover", "options"]);
    expect(first.snapshot.keywords).toHaveLength(2);
    expect(first.snapshot.editor?.positions).toHaveProperty(first.snapshot.rootNodeId, { x: 10, y: 20 });
    expect(first.snapshot.authoring).toEqual({
      templateKey: "lead",
      identity: { greeting: { en: "Welcome", th: "ยินดีต้อนรับ" }, brandColor: "#126149", widgetPosition: "bottom_left",
        businessHours: "Monday-Friday 09:00-17:00", handoverContact: "Shared inbox", privacyUrl: "https://example.test/privacy" },
      lead: { fields: [
        { key: "contact", label: { en: "Contact", th: "Contact" }, type: "email", required: true },
        { key: "contact_2", label: { en: "Contact", th: "Contact" }, type: "phone", required: false },
      ], consent: "I agree to follow-up." },
      handover: { teamLabel: "Shared inbox", fallback: { en: "A person can help.", th: "ทีมงานช่วยได้" }, outsideHoursMessage: "We will reply during business hours." },
      widget: { domain: "https://example.test", openOnLoad: false },
    });
  });

  it("rejects dangling paths instead of silently dropping claimed behavior", () => {
    expect(convertClaimedBuilderFlow({
      schemaVersion: 1, locale: "th", family: "flow",
      configuration: { flowDraft: { identity: { botName: "Broken Flow" }, entryId: "welcome", nodes: [
        { id: "welcome", type: "message", title: "Welcome", en: "Welcome", th: "สวัสดี", x: 0, y: 0, keywords: [], next: "missing", options: [], fields: [] },
      ] } },
    }, randomUUID())).toMatchObject({ status: "invalid", reasonCode: "builder_flow_invalid" });
  });
});
