import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/availability";
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

  const [profile] = (await sql`
    select
      acp.admin_user_id,
      acp.timezone,
      acp.default_duration_minutes,
      acp.meeting_location,
      au.name as admin_name,
      mt.id as meeting_type_id
    from admin_calendar_profiles acp
    join admin_users au on au.id = acp.admin_user_id and au.is_active = true and au.deleted_at is null
    left join meeting_types mt on mt.is_default = true and mt.is_active = true
    where acp.booking_slug = ${slug}
      and acp.is_active = true
    limit 1
  `) as {
    admin_user_id: string;
    timezone: string;
    default_duration_minutes: number;
    meeting_location: string | null;
    admin_name: string;
    meeting_type_id: string | null;
  }[];

  if (!profile) {
    return fail("Booking page is unavailable.", 404);
  }

  const start = new Date(startAt);
  if (!Number.isFinite(start.getTime())) {
    return fail("Invalid appointment time.");
  }

  const slots = await getAvailableSlots(
    sql,
    slug,
    new Date(start.getTime() - 60 * 1000),
    new Date(start.getTime() + 24 * 60 * 60 * 1000),
  );
  const slot = slots.find((item) => item.start_at === start.toISOString());

  if (!slot) {
    return fail("That time is no longer available.");
  }

  const rows = (await sql`
    insert into appointments (
      lead_id,
      conversation_id,
      assigned_admin_id,
      assigned_admin_name_snapshot,
      meeting_type_id,
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
      meeting_location
    )
    values (
      ${context?.leadId || null},
      ${context?.conversationId || null},
      ${profile.admin_user_id},
      ${profile.admin_name},
      ${profile.meeting_type_id},
      'pending_confirmation',
      ${context?.leadId || context?.conversationId ? "voice_agent" : "public_booking"},
      ${slot.start_at},
      ${slot.end_at},
      ${profile.timezone},
      ${profile.default_duration_minutes},
      ${clientName},
      ${companyName},
      ${email},
      ${phone},
      ${lineId},
      ${whatsapp},
      ${note},
      ${profile.meeting_location}
    )
    returning id
  `) as { id: string }[];

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
        assigned_admin_id = ${profile.admin_user_id},
        updated_at = now()
      where id = ${context.leadId}
    `;
  }

  if (wantsHtml) {
    return NextResponse.redirect(new URL(`/book/${slug}?booked=1`, request.url), 303);
  }

  return NextResponse.json({ ok: true, appointmentId: rows[0]?.id ?? null, status: "pending_confirmation" });
}
