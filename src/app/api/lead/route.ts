import { getSql } from "@/lib/db";
import { parseLeadPayload } from "@/lib/lead-validation";
import { verifySessionContext } from "@/lib/session-context";
import { corsJson, corsNoContent } from "@/lib/cors";
import { readJsonBody } from "@/lib/http-guards";
import { checkRateLimit } from "@/lib/rate-limit";
import { createBookingContext } from "@/lib/booking-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS(request: Request) {
  return corsNoContent(request);
}

export async function POST(request: Request) {
  try {
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

    const [bookingProfile] = (await sql`
      select
        s.booking_enabled,
        acp.booking_slug
      from settings s
      left join admin_calendar_profiles acp
        on acp.admin_user_id = s.active_booking_admin_id
        and acp.is_active = true
      left join admin_users au
        on au.id = s.active_booking_admin_id
        and au.is_active = true
        and au.deleted_at is null
      where s.id = 1
        and s.booking_enabled = true
        and au.id is not null
      limit 1
    `) as { booking_enabled: boolean; booking_slug: string | null }[];
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
          (select active_booking_admin_id from settings where id = 1 and booking_enabled = true),
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
          updated_at = now()
        returning id
      )
      select id from lead_row
    `) as { id: string }[];
    const leadId = rows[0]?.id ?? null;
    const bookingContext = leadId && bookingProfile?.booking_slug
      ? createBookingContext({
          leadId,
          conversationId: session.conversationId,
          clientName: lead.name || null,
          companyName: null,
          email,
          phone,
          lineId,
          whatsapp: null,
        })
      : null;
    const bookingUrl = bookingContext && bookingProfile?.booking_slug
      ? `${new URL(request.url).origin}/book/${bookingProfile.booking_slug}?context=${encodeURIComponent(bookingContext)}`
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
