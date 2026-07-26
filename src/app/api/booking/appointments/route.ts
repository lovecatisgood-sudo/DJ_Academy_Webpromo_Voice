import { NextResponse } from "next/server";
import { findAvailableSlot, getBookingLinkBySlug } from "@/lib/availability";
import { verifyBookingContext } from "@/lib/booking-context";
import { getSql } from "@/lib/db";
import { readJsonBody } from "@/lib/http-guards";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return /^[A-Za-z0-9.:_-]{1,80}$/.test(forwarded || real || "") ? forwarded || real || "unknown" : "unknown";
}

function clean(value: unknown, max = 300) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

async function readPayload(request: Request) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    return (await readJsonBody(request, 20000)) as Record<string, unknown>;
  }

  const form = await request.formData();
  return Object.fromEntries(form.entries()) as Record<string, unknown>;
}

export async function POST(request: Request) {
  const rateLimit = checkRateLimit(`booking-create:${requestKey(request)}`, 20, 60 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many booking attempts." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const body = await readPayload(request);
  const slug = clean(body.slug, 80);
  const startAt = clean(body.start_at, 80);
  const clientName = clean(body.client_name, 160);
  const email = clean(body.email, 240).toLowerCase();
  const companyName = clean(body.company_name, 200) || null;
  const phone = clean(body.phone, 80) || null;
  const lineId = clean(body.line_id, 120) || null;
  const whatsapp = clean(body.whatsapp, 120) || null;
  const note = clean(body.note, 1000) || null;
  const context = verifyBookingContext(clean(body.context, 4000));
  const wantsHtml = !((request.headers.get("accept") || "").includes("application/json"));

  function fail(message: string, status = 400) {
    if (wantsHtml) {
      return NextResponse.redirect(new URL(`/book/${slug}?error=${encodeURIComponent(message)}`, request.url), 303);
    }

    return NextResponse.json({ error: message }, { status });
  }

  if (!slug || !startAt || !clientName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return fail("Invalid booking details.");
  }

  const sql = getSql();
  const [settings] = (await sql`
    select booking_enabled from settings where id = 1 limit 1
  `) as { booking_enabled: boolean }[];

  if (!settings?.booking_enabled) {
    return fail("Booking is currently disabled.", 503);
  }

  const bookingLink = await getBookingLinkBySlug(sql, slug);

  if (!bookingLink || !bookingLink.is_active || !bookingLink.calendar_active) {
    return fail("Booking page is unavailable.", 404);
  }

  const [meetingType] = (await sql`
    select id
    from meeting_types
    where is_default = true
      and is_active = true
    limit 1
  `) as { id: string }[];

  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) {
    return fail("Invalid appointment time.");
  }

  const slot = await findAvailableSlot(sql, slug, start);

  if (!slot) {
    return fail("That time is no longer available.");
  }

  const appointmentSource = context?.sourceChannel === "text_widget"
    ? "text_chat"
    : context?.leadId || context?.conversationId
      ? "voice_agent"
      : "public_booking";

  let rows: { id: string }[];

  try {
    rows = (await sql`
      insert into appointments (
        lead_id,
        conversation_id,
        assigned_admin_id,
        assigned_admin_name_snapshot,
        meeting_type_id,
        booking_link_id,
        status,
        source,
        start_at,
        end_at,
        timezone,
        duration_minutes,
        client_name,
        company_name,
        email,
        phone,
        line_id,
        whatsapp,
        note,
        meeting_location,
        confirmed_at
      )
      values (
        ${context?.leadId || null},
        ${context?.conversationId || null},
        ${bookingLink.owner_admin_id},
        ${bookingLink.owner_name},
        ${meetingType?.id || null},
        ${bookingLink.id},
        ${bookingLink.require_confirmation ? "pending_confirmation" : "confirmed"},
        ${appointmentSource},
        ${slot.start_at},
        ${slot.end_at},
        ${bookingLink.timezone},
        ${bookingLink.duration_minutes},
        ${clientName},
        ${companyName},
        ${email},
        ${phone},
        ${lineId},
        ${whatsapp},
        ${note},
        ${bookingLink.meeting_location},
        ${bookingLink.require_confirmation ? null : new Date().toISOString()}
      )
      returning id
    `) as { id: string }[];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/appointments_active_slot_uidx|duplicate key|unique constraint/i.test(message)) {
      return fail("That time is no longer available.");
    }
    throw error;
  }

  if (context?.leadId) {
    await sql`
      update leads
      set
        status = 'appointment_set',
        client_name = coalesce(nullif(client_name, ''), ${clientName}),
        company_name = coalesce(nullif(company_name, ''), ${companyName}),
        email = coalesce(nullif(email, ''), ${email}),
        phone = coalesce(nullif(phone, ''), ${phone}),
        line_id = coalesce(nullif(line_id, ''), ${lineId}),
        whatsapp = coalesce(nullif(whatsapp, ''), ${whatsapp}),
        assigned_admin_id = ${bookingLink.owner_admin_id},
        updated_at = now()
      where id = ${context.leadId}
    `;
  }

  if (wantsHtml) {
    return NextResponse.redirect(new URL(`/book/${slug}?booked=${bookingLink.require_confirmation ? "requested" : "confirmed"}`, request.url), 303);
  }

  return NextResponse.json({ ok: true, appointmentId: rows[0]?.id ?? null, status: bookingLink.require_confirmation ? "pending_confirmation" : "confirmed" });
}
