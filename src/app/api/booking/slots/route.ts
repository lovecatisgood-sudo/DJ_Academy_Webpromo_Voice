import { NextResponse } from "next/server";
import { getAvailableSlots } from "@/lib/availability";
import { getSql } from "@/lib/db";
import { checkRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function requestKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const real = request.headers.get("x-real-ip")?.trim();
  return /^[A-Za-z0-9.:_-]{1,80}$/.test(forwarded || real || "") ? forwarded || real || "unknown" : "unknown";
}

export async function GET(request: Request) {
  const rateLimit = checkRateLimit(`booking-slots:${requestKey(request)}`, 120, 15 * 60 * 1000);

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many slot requests." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
    );
  }

  const params = new URL(request.url).searchParams;
  const slug = (params.get("slug") || "").trim();
  const from = new Date(params.get("from") || Date.now());
  const to = new Date(params.get("to") || Date.now() + 14 * 24 * 60 * 60 * 1000);

  if (!slug || !Number.isFinite(from.getTime()) || !Number.isFinite(to.getTime()) || to <= from) {
    return NextResponse.json({ error: "Invalid slot request." }, { status: 400 });
  }

  const sql = getSql();
  const [settings] = (await sql`
    select booking_enabled from settings where id = 1 limit 1
  `) as { booking_enabled: boolean }[];

  if (!settings?.booking_enabled) {
    return NextResponse.json({ slots: [], bookingEnabled: false });
  }

  const slots = await getAvailableSlots(sql, slug, from, to);
  return NextResponse.json({ slots, bookingEnabled: true });
}
