import type { AppointmentStatus, AvailabilityOverrideType } from "./types";

type Sql = ReturnType<typeof import("@neondatabase/serverless").neon>;

export type BookingSlot = {
  start_at: string;
  end_at: string;
  label: string;
};

export type BookingLinkForSlots = {
  id: string;
  owner_admin_id: string;
  slug: string;
  name: string;
  title: string;
  description: string | null;
  meeting_location: string | null;
  duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  max_bookings_per_day: number | null;
  booking_window_days: number;
  require_confirmation: boolean;
  is_active: boolean;
  is_ai_active: boolean;
  owner_name: string;
  timezone: string;
  display_name: string;
  calendar_active: boolean;
};

type AvailabilityRuleRow = {
  weekday: number;
  start_time: string;
  end_time: string;
};

type AvailabilityOverrideRow = {
  override_type: AvailabilityOverrideType;
  starts_at: string;
  ends_at: string;
};

type AppointmentBlockRow = {
  start_at: string;
  end_at: string;
  status: AppointmentStatus;
};

const bangkokOffsetMs = 7 * 60 * 60 * 1000;

function localDateKey(date: Date) {
  return new Date(date.getTime() + bangkokOffsetMs).toISOString().slice(0, 10);
}

function localWeekday(dateKey: string) {
  return new Date(`${dateKey}T00:00:00+07:00`).getUTCDay();
}

function localTimeLabel(iso: string) {
  return new Date(new Date(iso).getTime() + bangkokOffsetMs).toISOString().slice(11, 16);
}

function combineLocal(dateKey: string, time: string) {
  return new Date(`${dateKey}T${time.slice(0, 5)}:00+07:00`);
}

function overlaps(startA: number, endA: number, startB: number, endB: number) {
  return startA < endB && endA > startB;
}

function clampRange(start: number, end: number, min: number, max: number) {
  return {
    start: Math.max(start, min),
    end: Math.min(end, max),
  };
}

export async function getBookingLinkBySlug(sql: Sql, slug: string): Promise<BookingLinkForSlots | null> {
  const rows = (await sql`
    select
      bl.id,
      bl.owner_admin_id,
      bl.slug,
      bl.name,
      bl.title,
      bl.description,
      bl.meeting_location,
      bl.duration_minutes,
      bl.buffer_before_minutes,
      bl.buffer_after_minutes,
      bl.minimum_notice_minutes,
      bl.max_bookings_per_day,
      bl.booking_window_days,
      bl.require_confirmation,
      bl.is_active,
      bl.is_ai_active,
      au.name as owner_name,
      coalesce(acp.timezone, 'Asia/Bangkok') as timezone,
      coalesce(acp.display_name, au.name) as display_name,
      coalesce(acp.is_active, false) as calendar_active
    from booking_links bl
    join admin_users au
      on au.id = bl.owner_admin_id
      and au.is_active = true
      and au.deleted_at is null
    left join admin_calendar_profiles acp
      on acp.admin_user_id = bl.owner_admin_id
    where bl.slug = ${slug}
      and bl.deleted_at is null
    limit 1
  `) as BookingLinkForSlots[];

  return rows[0] || null;
}

export async function getActiveAiBookingLink(sql: Sql): Promise<BookingLinkForSlots | null> {
  const rows = (await sql`
    select
      bl.id,
      bl.owner_admin_id,
      bl.slug,
      bl.name,
      bl.title,
      bl.description,
      bl.meeting_location,
      bl.duration_minutes,
      bl.buffer_before_minutes,
      bl.buffer_after_minutes,
      bl.minimum_notice_minutes,
      bl.max_bookings_per_day,
      bl.booking_window_days,
      bl.require_confirmation,
      bl.is_active,
      bl.is_ai_active,
      au.name as owner_name,
      coalesce(acp.timezone, 'Asia/Bangkok') as timezone,
      coalesce(acp.display_name, au.name) as display_name,
      coalesce(acp.is_active, false) as calendar_active
    from settings s
    join booking_links bl
      on bl.id = s.active_booking_link_id
      and bl.deleted_at is null
      and bl.is_active = true
    join admin_users au
      on au.id = bl.owner_admin_id
      and au.is_active = true
      and au.deleted_at is null
    left join admin_calendar_profiles acp
      on acp.admin_user_id = bl.owner_admin_id
    where s.id = 1
      and s.booking_enabled = true
    limit 1
  `) as BookingLinkForSlots[];

  return rows[0] || null;
}

async function getAvailableSlotsForLink(sql: Sql, link: BookingLinkForSlots, from: Date, to: Date): Promise<BookingSlot[]> {
  if (!link.is_active || !link.calendar_active) return [];

  const now = Date.now();
  const minStart = now + link.minimum_notice_minutes * 60 * 1000;
  const maxStart = now + link.booking_window_days * 24 * 60 * 60 * 1000;
  const rangeStart = Math.max(from.getTime(), minStart);
  const rangeEnd = Math.min(to.getTime(), maxStart);

  if (rangeEnd <= rangeStart) return [];

  const rules = (await sql`
    select weekday, start_time::text as start_time, end_time::text as end_time
    from availability_rules
    where admin_user_id = ${link.owner_admin_id}
      and is_active = true
    order by weekday, start_time
  `) as AvailabilityRuleRow[];
  const overrides = (await sql`
    select override_type, starts_at, ends_at
    from availability_overrides
    where admin_user_id = ${link.owner_admin_id}
      and ends_at > ${new Date(rangeStart).toISOString()}
      and starts_at < ${new Date(rangeEnd).toISOString()}
    order by starts_at
  `) as AvailabilityOverrideRow[];
  const appointments = (await sql`
    select start_at, end_at, status
    from appointments
    where assigned_admin_id = ${link.owner_admin_id}
      and deleted_at is null
      and status in ('pending_confirmation', 'confirmed', 'completed', 'no_show')
      and end_at > ${new Date(rangeStart).toISOString()}
      and start_at < ${new Date(rangeEnd).toISOString()}
    order by start_at
  `) as AppointmentBlockRow[];

  const slots: BookingSlot[] = [];
  const durationMs = link.duration_minutes * 60 * 1000;
  const bufferBeforeMs = link.buffer_before_minutes * 60 * 1000;
  const bufferAfterMs = link.buffer_after_minutes * 60 * 1000;
  const startDay = localDateKey(new Date(rangeStart));
  const endDay = localDateKey(new Date(rangeEnd));
  let cursor = new Date(`${startDay}T00:00:00+07:00`);
  const finalDay = new Date(`${endDay}T00:00:00+07:00`);
  const slotsPerDay = new Map<string, number>();

  while (cursor.getTime() <= finalDay.getTime()) {
    const dateKey = localDateKey(cursor);
    const weekday = localWeekday(dateKey);
    const dayRules = rules.filter((rule) => rule.weekday === weekday);
    const extraWindows = overrides.filter((override) => override.override_type === "extra_available" && localDateKey(new Date(override.starts_at)) === dateKey);
    const windows = [
      ...dayRules.map((rule) => ({
        start: combineLocal(dateKey, rule.start_time).getTime(),
        end: combineLocal(dateKey, rule.end_time).getTime(),
      })),
      ...extraWindows.map((override) => ({
        start: new Date(override.starts_at).getTime(),
        end: new Date(override.ends_at).getTime(),
      })),
    ];

    for (const window of windows) {
      const clamped = clampRange(window.start, window.end, rangeStart, rangeEnd);
      let slotStart = clamped.start;

      while (slotStart + durationMs <= clamped.end) {
        const slotEnd = slotStart + durationMs;
        const blockedByOverride = overrides.some((override) => {
          if (override.override_type !== "blocked") return false;
          return overlaps(slotStart, slotEnd, new Date(override.starts_at).getTime(), new Date(override.ends_at).getTime());
        });
        const blockedByAppointment = appointments.some((appointment) => (
          overlaps(
            slotStart,
            slotEnd,
            new Date(appointment.start_at).getTime() - bufferBeforeMs,
            new Date(appointment.end_at).getTime() + bufferAfterMs,
          )
        ));
        const dayCount = slotsPerDay.get(dateKey) ?? 0;
        const blockedByDailyCap = link.max_bookings_per_day !== null && dayCount >= link.max_bookings_per_day;

        if (!blockedByOverride && !blockedByAppointment && !blockedByDailyCap) {
          const startIso = new Date(slotStart).toISOString();
          const endIso = new Date(slotEnd).toISOString();
          slots.push({
            start_at: startIso,
            end_at: endIso,
            label: localTimeLabel(startIso),
          });
          slotsPerDay.set(dateKey, dayCount + 1);
        }

        slotStart += durationMs;
      }
    }

    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000);
  }

  return slots;
}

export async function getAvailableSlots(sql: Sql, bookingSlug: string, from: Date, to: Date): Promise<BookingSlot[]> {
  const link = await getBookingLinkBySlug(sql, bookingSlug);

  if (!link) return [];

  return getAvailableSlotsForLink(sql, link, from, to);
}

export async function getAvailableSlotsForBookingLinkId(sql: Sql, bookingLinkId: string, from: Date, to: Date): Promise<BookingSlot[]> {
  const rows = (await sql`
    select slug
    from booking_links
    where id = ${bookingLinkId}
      and deleted_at is null
    limit 1
  `) as { slug: string }[];

  return rows[0] ? getAvailableSlots(sql, rows[0].slug, from, to) : [];
}

export async function findAvailableSlot(sql: Sql, bookingSlug: string, startAt: Date): Promise<BookingSlot | null> {
  const slots = await getAvailableSlots(
    sql,
    bookingSlug,
    new Date(startAt.getTime() - 60 * 1000),
    new Date(startAt.getTime() + 24 * 60 * 60 * 1000),
  );

  return slots.find((slot) => slot.start_at === startAt.toISOString()) || null;
}
