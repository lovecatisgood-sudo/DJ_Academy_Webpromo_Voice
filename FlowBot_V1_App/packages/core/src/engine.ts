import type { EngineInput, EngineResult, FlowSnapshot, Language, OutboundMessage } from "@flowbot/shared";
import { matchKeyword } from "./matcher";

type FlowNodeSnapshot = FlowSnapshot["nodes"][string];
type EngineEvent = EngineResult["events"][number];

export type EngineContext = {
  tenantId: string;
  botId: string;
  conversation: {
    id: string;
    flowVersionId: string;
    currentNodeId?: string | null;
    status: "bot" | "awaiting_admin" | "admin_active";
    lang: "th" | "en";
  };
  config: {
    snapshot: FlowSnapshot;
  };
};

export async function advance(ctx: EngineContext, input: EngineInput): Promise<EngineResult> {
  if (ctx.conversation.status !== "bot") {
    return {
      messages: [],
      stateUpdates: {},
      events: [{ type: "input_blocked_by_state", payload: { inputType: input.type } }],
      effects: []
    };
  }

  const snapshot = ctx.config.snapshot;
  const lang = ctx.conversation.lang;
  const currentNode = snapshot.nodes[ctx.conversation.currentNodeId ?? snapshot.rootNodeId] ?? snapshot.nodes[snapshot.rootNodeId];

  if (input.type === "action") {
    if (input.payload.action === "restart" || input.payload.action === "return_to_bot") {
      return {
        messages: renderNode(snapshot.nodes[snapshot.rootNodeId], lang),
        stateUpdates: { status: "bot", currentNodeId: snapshot.rootNodeId },
        events: [{ type: "release", payload: { source: input.payload.action } }],
        effects: []
      };
    }
  }

  if (input.type === "option") {
    const option = currentNode?.options.find((candidate) => candidate.id === input.payload.optionId);
    const targetNode = option ? snapshot.nodes[option.targetNodeId] : null;

    if (!option || !targetNode) {
      return handoffResult(lang, "invalid_option");
    }

    return nodeResult(targetNode, lang, [{ type: "option_click", payload: { optionId: option.id, targetNodeId: targetNode.id } }]);
  }

  if (input.type === "form") {
    const node = snapshot.nodes[input.payload.nodeId] ?? currentNode;
    if (!node || node.type !== "cta_lead_form") {
      return handoffResult(lang, "invalid_form_node");
    }

    const validation = validateFormData(node, input.payload.data, lang);
    if (!validation.ok) {
      return {
        messages: [
          {
            type: "text",
            content: { text: validation.message }
          },
          ...renderNode(node, lang)
        ],
        stateUpdates: { status: "bot", currentNodeId: node.id },
        events: [{ type: "form_invalid", payload: { sourceNodeId: node.id, missingFields: validation.missingFields } }],
        effects: []
      };
    }

    return {
      messages: [
        {
          type: "text",
          content: {
            text:
              lang === "th"
                ? "ขอบคุณครับ ผมรับข้อมูลไว้แล้ว ทีมงานจะดูรายละเอียดก่อนติดต่อกลับครับ"
                : "Thank you. I have captured the details, and our team will review them before following up."
          }
        }
      ],
      stateUpdates: { status: "bot", currentNodeId: snapshot.rootNodeId },
      events: [{ type: "lead_submit", payload: { sourceNodeId: node.id } }],
      effects: [{ type: "create_lead", payload: { sourceNodeId: node.id, data: input.payload.data } }]
    };
  }

  if (input.type === "text") {
    const match = matchKeyword(input.payload.text, lang, snapshot.keywords ?? []);
    if (match.kind === "match") {
      const targetNode = snapshot.nodes[match.nodeId];
      if (targetNode) {
        return nodeResult(targetNode, lang, [
          {
            type: "keyword_match",
            payload: { keyword: match.keyword, nodeId: targetNode.id, tier: match.tier }
          }
        ]);
      }
    }

    if (match.kind === "suggestions") {
      return handoffResult(lang, "ambiguous_keyword");
    }

    return handoffResult(lang, "keyword_miss");
  }

  return handoffResult(lang, "unsupported_input");
}

function nodeResult(node: FlowNodeSnapshot, lang: Language, events: EngineEvent[] = []): EngineResult {
  if (node.type === "cta_live_chat") {
    return {
      messages: renderNode(node, lang),
      stateUpdates: { status: "awaiting_admin", currentNodeId: node.id },
      events: [...events, { type: "takeover", payload: { sourceNodeId: node.id, reason: "cta_live_chat" } }],
      effects: [{ type: "request_handoff", payload: { reason: "cta_live_chat" } }]
    };
  }

  return {
    messages: renderNode(node, lang),
    stateUpdates: { currentNodeId: node.id },
    events,
    effects: []
  };
}

function handoffResult(lang: Language, reason: string): EngineResult {
  return {
    messages: [
      {
        type: "text",
        content: {
          text:
            lang === "th"
              ? "เรื่องนี้ผมอยากให้ทีมงานช่วยดูต่อให้ละเอียดครับ ฝากข้อมูลไว้ได้เลย หรือรอสักครู่ให้แอดมินมาตอบครับ"
              : "I would like our team to look at this properly. You can leave your details, or wait here for an admin reply."
        }
      }
    ],
    stateUpdates: { status: "awaiting_admin" },
    events: [
      { type: "keyword_miss", payload: { reason } },
      { type: "fallback", payload: { reason } }
    ],
    effects: [{ type: "request_handoff", payload: { reason } }]
  };
}

function renderNode(node: FlowNodeSnapshot | undefined, lang: Language): OutboundMessage[] {
  if (!node) return [];
  const text = lang === "th" ? node.contentTh : node.contentEn;

  if (node.type === "options") {
    return [
      {
        type: "options",
        content: {
          text,
          options: node.options.map((option) => ({
            id: option.id,
            label: lang === "th" ? option.labelTh : option.labelEn,
            targetNodeId: option.targetNodeId
          }))
        }
      }
    ];
  }

  if (node.type === "cta_lead_form") {
    return [
      {
        type: "form",
        content: {
          text,
          nodeId: node.id,
          fields: node.config.fields ?? [
            { name: "name", label: lang === "th" ? "ชื่อ" : "Name", required: true },
            { name: "phone", label: lang === "th" ? "เบอร์โทร" : "Phone", required: true },
            { name: "email", label: "Email", required: false }
          ]
        }
      }
    ];
  }

  if (node.type === "cta_link") {
    return [
      {
        type: "cta",
        content: {
          kind: "link",
          text,
          label: localizedConfigString(node.config, lang, "label") ?? (lang === "th" ? "เปิดลิงก์" : "Open link"),
          url: typeof node.config.url === "string" ? node.config.url : ""
        }
      }
    ];
  }

  if (node.type === "cta_contact_card") {
    return [
      {
        type: "cta",
        content: {
          kind: "contact_channels",
          text,
          channels: Array.isArray(node.config.channels) ? node.config.channels : []
        }
      }
    ];
  }

  return [{ type: "text", content: { text } }];
}

function validateFormData(
  node: FlowNodeSnapshot,
  data: Record<string, string>,
  lang: Language
):
  | { ok: true }
  | { ok: false; message: string; missingFields: string[] } {
  const fields = Array.isArray(node.config.fields)
    ? node.config.fields
    : [
        { name: "name", required: true },
        { name: "phone", required: true },
        { name: "email", required: false }
      ];
  const normalizedFields = fields
    .map((field) => (isFormField(field) ? field : null))
    .filter((field): field is { name: string; required?: boolean } => field !== null);
  const missingFields = normalizedFields
    .filter((field) => field.required && !String(data[field.name] ?? "").trim())
    .map((field) => field.name);

  const emailValue = String(data.email ?? "").trim();
  if (emailValue && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
    missingFields.push("email");
  }

  if (missingFields.length === 0) return { ok: true };
  return {
    ok: false,
    missingFields,
    message:
      lang === "th"
        ? "ขอข้อมูลที่จำเป็นให้ครบก่อนนะครับ"
        : "Please complete the required details before submitting."
  };
}

function isFormField(value: unknown): value is { name: string; required?: boolean } {
  return Boolean(value && typeof value === "object" && "name" in value && typeof value.name === "string");
}

function localizedConfigString(config: Record<string, unknown>, lang: Language, key: string) {
  const localizedKey = lang === "th" ? `${key}Th` : `${key}En`;
  const localized = config[localizedKey];
  if (typeof localized === "string" && localized.trim()) return localized;
  const fallback = config[key];
  return typeof fallback === "string" && fallback.trim() ? fallback : undefined;
}
