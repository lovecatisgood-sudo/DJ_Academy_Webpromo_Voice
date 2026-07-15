import { getActiveAiBookingLink, getAvailableSlots } from "@/lib/availability";
import { createBookingContext } from "@/lib/booking-context";
import { corsJson, corsNoContent, isAllowedCorsRequest } from "@/lib/cors";
import { getSql } from "@/lib/db";
import { requireEnv } from "@/lib/env";
import { readJsonBody } from "@/lib/http-guards";
import { buildTextChatSystemPrompt } from "@/lib/prompt";
import { checkRateLimit } from "@/lib/rate-limit";
import { elapsedMs, logServerTiming, nowMs } from "@/lib/server-timing";
import { verifySessionContext } from "@/lib/session-context";
import { getCachedSettings } from "@/lib/settings-cache";
import type { ConversationMessageRole } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LeadCandidate = {
  client_name?: string;
  company_name?: string;
  phone?: string;
  email?: string;
  line_id?: string;
  whatsapp?: string;
  other_contact?: string;
  business_problem?: string;
  recommended_service?: string;
  preferred_meeting_day?: string;
  preferred_meeting_time?: string;
  ready_for_booking?: boolean;
};

function requestKey(request: Request) {
  const realIp = request.headers.get("x-real-ip")?.trim();
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const candidate = realIp || forwardedFor || "unknown";
  return /^[A-Za-z0-9.:_-]{1,80}$/.test(candidate) ? candidate : "unknown";
}

function clean(value: unknown, max = 1000) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").slice(0, max) : "";
}

function sanitizePageUrl(value: unknown) {
  if (typeof value !== "string") return "";

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return "";
    return `${parsed.origin}${parsed.pathname}`.slice(0, 1000);
  } catch {
    return "";
  }
}

function inferLanguage(value: unknown): "th" | "en" | "auto" {
  return value === "th" || value === "en" ? value : "auto";
}

function pickContact(candidate: LeadCandidate) {
  const email = clean(candidate.email, 240).toLowerCase();
  if (email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { contact: email, contactType: "email" };
  const phone = clean(candidate.phone, 80);
  if (phone) return { contact: phone, contactType: "phone" };
  const lineId = clean(candidate.line_id, 120);
  if (lineId) return { contact: lineId, contactType: "line" };
  const whatsapp = clean(candidate.whatsapp, 120);
  if (whatsapp) return { contact: whatsapp, contactType: "other" };
  const other = clean(candidate.other_contact, 240);
  if (other) return { contact: other, contactType: "other" };
  return null;
}

function safeJsonObject(content: string) {
  try {
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(content.slice(start, end + 1)) as Record<string, unknown>;
      } catch {
      }
    }
  }

  return { reply: content };
}

function isGpt5ChatModel(model: string) {
  return /^gpt-5(?:[.-]|$)/i.test(model.trim());
}

async function callOpenAiText({
  model,
  systemPrompt,
  recentMessages,
  userMessage,
  safetyIdentifier,
}: {
  model: string;
  systemPrompt: string;
  recentMessages: { role: ConversationMessageRole; content: string }[];
  userMessage: string;
  safetyIdentifier: string;
}) {
  const messages = [
    { role: "system", content: systemPrompt },
    ...recentMessages.map((message) => ({
      role: message.role === "assistant" ? "assistant" : message.role === "user" ? "user" : "system",
      content: message.content,
    })),
    { role: "user", content: userMessage },
  ];
  const isGpt5 = isGpt5ChatModel(model);
  const requestBody = {
    model,
    messages,
    response_format: { type: "json_object" },
    ...(isGpt5
      ? { max_completion_tokens: 1600 }
      : { temperature: 0.7, max_tokens: 900 }),
  };
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("OPENAI_API_KEY")}`,
      "Content-Type": "application/json",
      "OpenAI-Safety-Identifier": safetyIdentifier,
    },
    body: JSON.stringify(requestBody),
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof data.error?.message === "string" ? data.error.message : "Text model request failed.");
  }

  return {
    content: typeof data.choices?.[0]?.message?.content === "string"
      ? data.choices[0].message.content
      : "",
    usage: data.usage && typeof data.usage === "object" ? data.usage as Record<string, unknown> : null,
  };
}

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  const startedAt = nowMs();
  let dbMs = 0;
  let modelMs = 0;
  let conversationId: string | null = null;
  try {
    if (!isAllowedCorsRequest(request)) {
      return corsJson(request, { error: "Origin is not allowed." }, { status: 403 });
    }

    const body = (await readJsonBody(request, 12000)) as {
      sessionContext?: unknown;
      message?: unknown;
      pageUrl?: unknown;
      preferredLanguage?: unknown;
    };
    const session = verifySessionContext(body.sessionContext);
    conversationId = session.conversationId;
    const safetyIdentifier = requestKey(request);
    const rateLimit = checkRateLimit(`chat-message:${safetyIdentifier}:${session.conversationId}`, 80, 60 * 60 * 1000);

    if (!rateLimit.allowed) {
      return corsJson(request, { error: "Too many chat messages." }, { status: 429 });
    }

    const message = clean(body.message, 2000);
    if (!message) {
      return corsJson(request, { error: "Message is required." }, { status: 400 });
    }

    const settings = await getCachedSettings();
    if (!settings.text_chat_enabled) {
      return corsJson(request, { error: "Chatbot is currently offline." }, { status: 403 });
    }

    const sql = getSql();
    let dbStartedAt = nowMs();
    const [conversation] = (await sql`
      select id, message_count
      from conversations
      where id = ${session.conversationId}
        and channel = 'text_widget'
        and deleted_at is null
      limit 1
    `) as { id: string; message_count: number }[];
    dbMs += elapsedMs(dbStartedAt);

    if (!conversation) {
      return corsJson(request, { error: "Chat session not found." }, { status: 404 });
    }

    if (conversation.message_count >= settings.text_chat_max_messages) {
      return corsJson(request, { error: "This chat reached its message limit. Please book or start a new chat." }, { status: 429 });
    }

    dbStartedAt = nowMs();
    await sql`
      insert into conversation_messages (conversation_id, channel, role, content)
      values (${session.conversationId}, 'text_widget', 'user', ${message})
    `;
    await sql`
      update conversations
      set message_count = message_count + 1, last_message_at = now()
      where id = ${session.conversationId}
    `;
    dbMs += elapsedMs(dbStartedAt);

    dbStartedAt = nowMs();
    const recent = (await sql`
      select role, content
      from conversation_messages
      where conversation_id = ${session.conversationId}
      order by created_at desc
      limit 18
    `) as { role: ConversationMessageRole; content: string }[];
    dbMs += elapsedMs(dbStartedAt);
    const recentMessages = recent.reverse().slice(0, -1);
    const systemPrompt = buildTextChatSystemPrompt({
      settings,
      pageUrl: sanitizePageUrl(body.pageUrl),
      preferredLanguage: inferLanguage(body.preferredLanguage),
      now: new Date(),
    });
    const modelStartedAt = nowMs();
    const modelResult = await callOpenAiText({
      model: settings.text_chat_model_id,
      systemPrompt,
      recentMessages,
      userMessage: message,
      safetyIdentifier,
    });
    modelMs += elapsedMs(modelStartedAt);
    const raw = modelResult.content;
    const parsed = safeJsonObject(raw);
    const reply = clean(parsed.reply, 4000) || "Sorry, I had trouble replying. Could you send that again?";
    const candidate = (parsed.lead_candidate && typeof parsed.lead_candidate === "object"
      ? parsed.lead_candidate
      : {}) as LeadCandidate;
    const assistantMetadata = modelResult.usage
      ? JSON.stringify({ model: settings.text_chat_model_id, usage: modelResult.usage })
      : null;

    dbStartedAt = nowMs();
    await sql`
      insert into conversation_messages (conversation_id, channel, role, content, token_count, metadata)
      values (
        ${session.conversationId},
        'text_widget',
        'assistant',
        ${reply},
        ${typeof modelResult.usage?.total_tokens === "number" ? modelResult.usage.total_tokens : null},
        ${assistantMetadata}::jsonb
      )
    `;
    await sql`
      update conversations
      set message_count = message_count + 1, last_message_at = now()
      where id = ${session.conversationId}
    `;
    dbMs += elapsedMs(dbStartedAt);

    const contact = pickContact(candidate);
    const clientName = clean(candidate.client_name, 160);
    const companyName = clean(candidate.company_name, 200) || null;
    const businessProblem = clean(candidate.business_problem, 1000);
    const recommendedService = clean(candidate.recommended_service, 300);
    const preferredDay = clean(candidate.preferred_meeting_day, 120) || null;
    const preferredTime = clean(candidate.preferred_meeting_time, 120) || null;
    const leadNeed = businessProblem || recommendedService;
    let leadId: string | null = null;

    const bookingLinkStartedAt = nowMs();
    const bookingLink = await getActiveAiBookingLink(sql);
    dbMs += elapsedMs(bookingLinkStartedAt);
    const displayName = clientName || companyName || "Website visitor";
    if (contact && leadNeed) {
      dbStartedAt = nowMs();
      const rows = (await sql`
        insert into leads (
          conversation_id,
          name,
          contact,
          contact_type,
          need,
          preferred_time,
          status,
          client_name,
          company_name,
          phone,
          email,
          line_id,
          whatsapp,
          other_contact,
          preferred_meeting_day,
          preferred_meeting_time,
          assigned_admin_id,
          source_channel,
          source_mode,
          updated_at
        )
        values (
          ${session.conversationId},
          ${displayName},
          ${contact.contact},
          ${contact.contactType},
          ${leadNeed},
          ${[preferredDay, preferredTime].filter(Boolean).join(" ") || null},
          'pending_follow_up',
          ${clientName || null},
          ${companyName},
          ${clean(candidate.phone, 80) || null},
          ${clean(candidate.email, 240).toLowerCase() || null},
          ${clean(candidate.line_id, 120) || null},
          ${clean(candidate.whatsapp, 120) || null},
          ${clean(candidate.other_contact, 240) || null},
          ${preferredDay},
          ${preferredTime},
          ${bookingLink?.owner_admin_id || null},
          'text_widget',
          'text',
          now()
        )
        on conflict (conversation_id, contact) do update set
          name = coalesce(nullif(excluded.name, ''), leads.name),
          need = coalesce(nullif(excluded.need, ''), leads.need),
          preferred_time = coalesce(excluded.preferred_time, leads.preferred_time),
          client_name = coalesce(nullif(excluded.client_name, ''), leads.client_name),
          company_name = coalesce(excluded.company_name, leads.company_name),
          phone = coalesce(excluded.phone, leads.phone),
          email = coalesce(excluded.email, leads.email),
          line_id = coalesce(excluded.line_id, leads.line_id),
          whatsapp = coalesce(excluded.whatsapp, leads.whatsapp),
          other_contact = coalesce(excluded.other_contact, leads.other_contact),
          preferred_meeting_day = coalesce(excluded.preferred_meeting_day, leads.preferred_meeting_day),
          preferred_meeting_time = coalesce(excluded.preferred_meeting_time, leads.preferred_meeting_time),
          assigned_admin_id = coalesce(leads.assigned_admin_id, excluded.assigned_admin_id),
          source_channel = coalesce(leads.source_channel, excluded.source_channel),
          source_mode = coalesce(leads.source_mode, excluded.source_mode),
          updated_at = now()
        returning id
      `) as { id: string }[];
      leadId = rows[0]?.id ?? null;

      await sql`
        update conversations
        set had_lead = true
        where id = ${session.conversationId}
      `;
      dbMs += elapsedMs(dbStartedAt);
    }

    const readyForBooking = candidate.ready_for_booking === true;
    const bookingSlots = bookingLink && leadId && readyForBooking
      ? await (async () => {
          const slotsStartedAt = nowMs();
          const slots = await getAvailableSlots(sql, bookingLink.slug, new Date(), new Date(Date.now() + Math.min(bookingLink.booking_window_days, 14) * 24 * 60 * 60 * 1000));
          dbMs += elapsedMs(slotsStartedAt);
          return slots;
        })()
      : [];
    const bookingContext = leadId && bookingLink && bookingSlots.length > 0
      ? createBookingContext({
          leadId,
          conversationId: session.conversationId,
          clientName: clientName || null,
          companyName,
          email: clean(candidate.email, 240).toLowerCase() || null,
          phone: clean(candidate.phone, 80) || null,
          lineId: clean(candidate.line_id, 120) || null,
          whatsapp: clean(candidate.whatsapp, 120) || null,
          sourceChannel: "text_widget",
          sourceMode: "text",
        })
      : null;
    const bookingUrl = bookingContext && bookingLink
      ? `${new URL(request.url).origin}/book/${bookingLink.slug}?context=${encodeURIComponent(bookingContext)}`
      : null;

    return corsJson(request, {
      ok: true,
      reply,
      lead: {
        captured: Boolean(leadId),
        leadId,
      },
      booking: {
        available: Boolean(bookingUrl),
        url: bookingUrl,
      },
    });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: error instanceof Error ? error.message : "Chat message failed." }, { status: 400 });
  } finally {
    logServerTiming({
      route: "api.chat.message",
      conversationId,
      channel: "text_widget",
      dbMs,
      modelMs,
      totalMs: elapsedMs(startedAt),
    });
  }
}
