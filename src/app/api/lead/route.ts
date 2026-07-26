import { getSql } from "@/lib/db";
import { parseLeadPayload } from "@/lib/lead-validation";
import { verifySessionContext } from "@/lib/session-context";
import { corsJson, corsNoContent, isAllowedCorsRequest } from "@/lib/cors";
import { readJsonBody } from "@/lib/http-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { createBookingContext } from "@/lib/booking-context";
import { getActiveAiBookingLink, getAvailableSlots } from "@/lib/availability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  try {
    if (!isAllowedCorsRequest(request)) {
      return corsJson(request, { error: "Origin is not allowed." }, { status: 403 });
    }

    const body = (await readJsonBody(request, 20000)) as { sessionContext?: unknown; lead?: unknown };
    const session = verifySessionContext(body.sessionContext);
    const rateLimit = checkRateLimit(`lead:${session.conversationId}`, 5, 60 * 60 * 1000);

    if (!rateLimit.allowed) {
      return corsJson(
        request,
        { error: "Too many lead capture attempts for this session." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const lead = parseLeadPayload(body.lead);
    const sql = getSql();
    const phone = lead.contact_type === "phone" ? lead.contact : null;
    const email = lead.contact_type === "email" ? lead.contact : null;
    const lineId = lead.contact_type === "line" ? lead.contact : null;
    const otherContact = lead.contact_type === "other" ? lead.contact : null;

    const bookingLink = await getActiveAiBookingLink(sql);
    const bookingSlots = bookingLink
      ? await getAvailableSlots(sql, bookingLink.slug, new Date(), new Date(Date.now() + Math.min(bookingLink.booking_window_days, 14) * 24 * 60 * 60 * 1000))
      : [];
    const rows = (await sql`
      with conversation_row as (
        insert into conversations (id, started_at, had_lead)
        values (${session.conversationId}, now(), true)
        on conflict (id) do update set had_lead = true
        returning id
      ),
      lead_row as (
        insert into leads (
          conversation_id,
          name,
          contact,
          contact_type,
          need,
          preferred_time,
          status,
          client_name,
          phone,
          email,
          line_id,
          other_contact,
          preferred_meeting_time,
          assigned_admin_id,
          source_channel,
          source_mode,
          updated_at
        )
        select
          id,
          ${lead.name},
          ${lead.contact},
          ${lead.contact_type},
          ${lead.need},
          ${lead.preferred_time},
          'pending_follow_up',
          ${lead.name},
          ${phone},
          ${email},
          ${lineId},
          ${otherContact},
          ${lead.preferred_time},
          ${bookingLink?.owner_admin_id || null},
          'voice_widget',
          'voice',
          now()
        from conversation_row
        on conflict (conversation_id, contact) do update set
          name = excluded.name,
          contact_type = excluded.contact_type,
          need = excluded.need,
          preferred_time = excluded.preferred_time,
          client_name = coalesce(nullif(leads.client_name, ''), excluded.client_name),
          phone = coalesce(nullif(leads.phone, ''), excluded.phone),
          email = coalesce(nullif(leads.email, ''), excluded.email),
          line_id = coalesce(nullif(leads.line_id, ''), excluded.line_id),
          other_contact = coalesce(nullif(leads.other_contact, ''), excluded.other_contact),
          preferred_meeting_time = coalesce(nullif(leads.preferred_meeting_time, ''), excluded.preferred_meeting_time),
          assigned_admin_id = coalesce(leads.assigned_admin_id, excluded.assigned_admin_id),
          source_channel = coalesce(leads.source_channel, excluded.source_channel),
          source_mode = coalesce(leads.source_mode, excluded.source_mode),
          updated_at = now()
        returning id
      )
      select id from lead_row
    `) as { id: string }[];
    const leadId = rows[0]?.id ?? null;
    const bookingContext = leadId && bookingLink && bookingSlots.length > 0
      ? createBookingContext({
          leadId,
          conversationId: session.conversationId,
          clientName: lead.name || null,
          companyName: null,
          email,
          phone,
          lineId,
          whatsapp: null,
          sourceChannel: "voice_widget",
          sourceMode: "voice",
        })
      : null;
    const bookingUrl = bookingContext && bookingLink
      ? `${new URL(request.url).origin}/book/${bookingLink.slug}?context=${encodeURIComponent(bookingContext)}`
      : null;

    return corsJson(request, {
      ok: true,
      leadId,
      booking: {
        available: Boolean(bookingUrl),
        url: bookingUrl,
      },
    });
  } catch (error) {
    console.error(error);
    return corsJson(request, { error: error instanceof Error ? error.message : "Lead capture failed." }, { status: 400 });
  }
}
