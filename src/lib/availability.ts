import type { AppointmentStatus, AvailabilityOverrideType } from "./types";

type Sql = ReturnType<typeof import("@neondatabase/serverless").neon>;

export type BookingSlot = {
  start_at: string;
  end_at: string;
  label: string;
};

type CalendarProfileRow = {
  admin_user_id: string;
  timezone: string;
  default_duration_minutes: number;
  buffer_before_minutes: number;
  buffer_after_minutes: number;
  minimum_notice_minutes: number;
  max_bookings_per_day: number | null;
  booking_window_days: number;
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

export async function getAvailableSlots(sql: Sql, bookingSlug: string, from: Date, to: Date): Promise<BookingSlot[]> {
  const profiles = (await sql`
    select
      admin_user_id,
      timezone,
      default_duration_minutes,
      buffer_before_minutes,
      buffer_after_minutes,
      minimum_notice_minutes,
      max_bookings_per_day,
      booking_window_days
    from admin_calendar_profiles
    where booking_slug = ${bookingSlug}
      and is_active = true
    limit 1
  `) as CalendarProfileRow[];
  const profile = profiles[0];

  if (!profile) return [];

  const now = Date.now();
  const minStart = now + profile.minimum_notice_minutes * 60 * 1000;
  const maxStart = now + profile.booking_window_days * 24 * 60 * 60 * 1000;
  const rangeStart = Math.max(from.getTime(), minStart);
  const rangeEnd = Math.min(to.getTime(), maxStart);

  if (rangeEnd <= rangeStart) return [];

  const rules = (await sql`
    select weekday, start_time::text as start_time, end_time::text as end_time
    from availability_rules
    where admin_user_id = ${profile.admin_user_id}
      and is_active = true
    order by weekday, start_time
  `) as AvailabilityRuleRow[];
  const overrides = (await sql`
    select override_type, starts_at, ends_at
    from availability_overrides
    where admin_user_id = ${profile.admin_user_id}
      and ends_at > ${new Date(rangeStart).toISOString()}
      and starts_at < ${new Date(rangeEnd).toISOString()}
    order by starts_at
  `) as AvailabilityOverrideRow[];
  const appointments = (await sql`
    select start_at, end_at, status
    from appointments
    where assigned_admin_id = ${profile.admin_user_id}
      and deleted_at is null
      and status in ('pending_confirmation', 'confirmed', 'completed', 'no_show')
      and end_at > ${new Date(rangeStart).toISOString()}
      and start_at < ${new Date(rangeEnd).toISOString()}
    order by start_at
  `) as AppointmentBlockRow[];

  const slots: BookingSlot[] = [];
  const durationMs = profile.default_duration_minutes * 60 * 1000;
  const bufferBeforeMs = profile.buffer_before_minutes * 60 * 1000;
  const bufferAfterMs = profile.buffer_after_minutes * 60 * 1000;
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
        const blockedByDailyCap = profile.max_bookings_per_day !== null && dayCount >= profile.max_bookings_per_day;

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
