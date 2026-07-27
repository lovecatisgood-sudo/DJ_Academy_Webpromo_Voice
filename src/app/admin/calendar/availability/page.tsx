import Link from "next/link";
import { AdminShell } from "../../AdminShell";
import {
  createAvailabilityOverrideAction,
  deleteAvailabilityOverrideAction,
  updateCalendarProfileAction,
  updateWeeklyAvailabilityAction,
} from "../../actions";
import { ConfirmSubmitButton } from "../../ConfirmSubmitButton";
import { getAvailableSlotsForBookingLinkId } from "@/lib/availability";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

const inputClass = "mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";
const compactInputClass = "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";
const sectionClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const labelClass = "block text-sm font-medium text-slate-700";
const weekdays = [
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
  ["0", "Sunday"],
] as const;

function datetimeLocal(value: string) {
  const local = new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function displayDate(value: string) {
  return new Date(`${value}T00:00:00+07:00`).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function groupSlots(slots: { start_at: string; end_at: string; label: string }[]) {
  const groups = new Map<string, typeof slots>();

  for (const slot of slots) {
    const key = new Date(new Date(slot.start_at).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    groups.set(key, [...(groups.get(key) || []), slot]);
  }

  return [...groups.entries()];
}

export default async function CalendarAvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string; link?: string; error?: string; saved?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const sql = getSql();
  const adminRows = admin.role === "master_admin"
    ? (await sql`
        select id, name, username
        from admin_users
        where is_active = true
          and deleted_at is null
        order by role desc, name asc
      `) as { id: string; name: string; username: string }[]
    : [{ id: admin.id, name: admin.name, username: admin.username }];
  const selectedAdminId = admin.role === "master_admin" && params.admin && adminRows.some((item) => item.id === params.admin)
    ? params.admin
    : admin.id;
  const selectedAdmin = adminRows.find((item) => item.id === selectedAdminId) || adminRows[0];
  const [profile] = (await sql`
    select *
    from admin_calendar_profiles
    where admin_user_id = ${selectedAdminId}
    limit 1
  `) as {
    id: string;
    display_name: string;
    booking_slug: string;
    timezone: string;
    meeting_title: string;
    meeting_location: string | null;
    default_duration_minutes: number;
    buffer_before_minutes: number;
    buffer_after_minutes: number;
    minimum_notice_minutes: number;
    max_bookings_per_day: number | null;
    booking_window_days: number;
    is_active: boolean;
    allow_admin_self_edit: boolean;
  }[];
  const rules = (await sql`
    select weekday, start_time::text as start_time, end_time::text as end_time
    from availability_rules
    where admin_user_id = ${selectedAdminId}
      and is_active = true
    order by weekday, start_time
  `) as { weekday: number; start_time: string; end_time: string }[];
  const overrides = (await sql`
    select id, override_type, starts_at, ends_at, reason
    from availability_overrides
    where admin_user_id = ${selectedAdminId}
      and ends_at >= now() - interval '1 day'
    order by starts_at asc
    limit 80
  `) as { id: string; override_type: string; starts_at: string; ends_at: string; reason: string | null }[];
  const links = (await sql`
    select id, name, slug, title, duration_minutes, is_active, is_ai_active
    from booking_links
    where owner_admin_id = ${selectedAdminId}
      and deleted_at is null
    order by is_ai_active desc, is_active desc, created_at asc
  `) as { id: string; name: string; slug: string; title: string; duration_minutes: number; is_active: boolean; is_ai_active: boolean }[];
  const selectedLink = links.find((item) => item.id === params.link) || links[0] || null;
  const redirectTarget = `/admin/calendar/availability?admin=${encodeURIComponent(selectedAdminId)}${selectedLink ? `&link=${encodeURIComponent(selectedLink.id)}` : ""}`;
  const previewSlots = selectedLink
    ? await getAvailableSlotsForBookingLinkId(
        sql,
        selectedLink.id,
        new Date(),
        new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      )
    : [];
  const groupedSlots = groupSlots(previewSlots.slice(0, 60));
  const needsSetup = !profile || rules.length === 0 || links.length === 0;

  return (
    <AdminShell>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Availability</h2>
          <p className="mt-1 text-sm text-slate-600">
            Set open appointment hours, block busy time, and preview real slots for booking links.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/calendar" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Calendar</Link>
          <Link href="/admin/calendar/links" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Booking links</Link>
          <Link href="/admin/calendar/setup" className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">Setup</Link>
        </div>
      </div>

      {params.error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Availability update failed: {params.error.replaceAll("_", " ")}.
        </div>
      ) : null}
      {params.saved ? (
        <div className="mb-5 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Availability saved.
        </div>
      ) : null}
      {needsSetup ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This calendar is not fully ready. Complete profile, weekly hours, and at least one booking link in setup.
          <Link href={`/admin/calendar/setup?admin=${selectedAdminId}`} className="ml-2 font-semibold text-amber-950 underline">Open setup</Link>
        </div>
      ) : null}

      <section className={`mb-5 grid gap-4 ${admin.role === "master_admin" ? "lg:grid-cols-2" : ""}`}>
        {admin.role === "master_admin" ? (
          <form className={sectionClass}>
            <label className={labelClass}>
              Editing admin
              <select name="admin" defaultValue={selectedAdminId} className={inputClass}>
                {adminRows.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.username})</option>
                ))}
              </select>
            </label>
            <button className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Switch admin</button>
          </form>
        ) : null}
        <form className={sectionClass}>
          <input type="hidden" name="admin" value={selectedAdminId} />
          <label className={labelClass}>
            Slot preview link
            <select name="link" defaultValue={selectedLink?.id || ""} className={inputClass}>
              {links.map((link) => (
                <option key={link.id} value={link.id}>
                  {link.name} · {link.duration_minutes} min{link.is_ai_active ? " · AI active" : ""}
                </option>
              ))}
            </select>
          </label>
          <button className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Preview link</button>
        </form>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1fr_420px]">
        <div className="space-y-5">
          <form action={updateCalendarProfileAction} className={sectionClass}>
            <input type="hidden" name="redirect_to" value={redirectTarget} />
            <input type="hidden" name="admin_user_id" value={selectedAdminId} />
            <h3 className="text-lg font-semibold text-slate-950">Calendar profile</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <label className={labelClass}>
                Display name
                <input name="display_name" defaultValue={profile?.display_name || selectedAdmin?.name || ""} className={inputClass} required />
              </label>
              <label className={labelClass}>
                Compatibility slug
                <input name="booking_slug" defaultValue={profile?.booking_slug || selectedAdmin?.username || ""} className={inputClass} required />
              </label>
              <label className={labelClass}>
                Timezone
                <input name="timezone" defaultValue={profile?.timezone || "Asia/Bangkok"} className={inputClass} />
              </label>
              <label className={labelClass}>
                Default meeting title
                <input name="meeting_title" defaultValue={profile?.meeting_title || "ปรึกษากับ DJAI"} className={inputClass} />
              </label>
              <label className={labelClass}>
                Default location/link
                <input name="meeting_location" defaultValue={profile?.meeting_location || ""} className={inputClass} />
              </label>
              <label className={labelClass}>
                Default duration
                <input name="default_duration_minutes" type="number" min={10} max={240} defaultValue={profile?.default_duration_minutes || 30} className={inputClass} />
              </label>
              <input type="hidden" name="buffer_before_minutes" value={profile?.buffer_before_minutes ?? 0} />
              <input type="hidden" name="buffer_after_minutes" value={profile?.buffer_after_minutes ?? 0} />
              <input type="hidden" name="minimum_notice_minutes" value={profile?.minimum_notice_minutes ?? 240} />
              <input type="hidden" name="max_bookings_per_day" value={profile?.max_bookings_per_day ?? ""} />
              <input type="hidden" name="booking_window_days" value={profile?.booking_window_days ?? 30} />
              <div className="flex flex-col justify-end gap-3">
                <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                  <input name="is_active" type="checkbox" defaultChecked={profile?.is_active ?? true} />
                  Calendar active
                </label>
                {admin.role === "master_admin" ? (
                  <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                    <input name="allow_admin_self_edit" type="checkbox" defaultChecked={profile?.allow_admin_self_edit ?? true} />
                    Allow self-edit
                  </label>
                ) : null}
              </div>
            </div>
            <button className="mt-5 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Save profile</button>
          </form>

          <form action={updateWeeklyAvailabilityAction} className={sectionClass}>
            <input type="hidden" name="redirect_to" value={redirectTarget} />
            <input type="hidden" name="admin_user_id" value={selectedAdminId} />
            <h3 className="text-lg font-semibold text-slate-950">Weekly open hours</h3>
            <p className="mt-1 text-sm text-slate-600">Customers can only book inside these hours unless you add an extra-available override.</p>
            <div className="mt-5 divide-y divide-slate-100">
              {weekdays.map(([weekday, label]) => {
                const dayRules = rules.filter((rule) => rule.weekday === Number(weekday));
                return (
                  <div key={weekday} className="grid gap-3 py-4 md:grid-cols-[120px_1fr_1fr] md:items-center">
                    <div className="font-semibold text-slate-700">{label}</div>
                    {[1, 2].map((slot) => {
                      const rule = dayRules[slot - 1];
                      return (
                        <div key={slot} className="grid grid-cols-2 gap-2">
                          <input name={`day_${weekday}_start_${slot}`} type="time" defaultValue={rule?.start_time?.slice(0, 5) || ""} className={compactInputClass} />
                          <input name={`day_${weekday}_end_${slot}`} type="time" defaultValue={rule?.end_time?.slice(0, 5) || ""} className={compactInputClass} />
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
            <button className="mt-5 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Save weekly hours</button>
          </form>

          <section className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <form action={createAvailabilityOverrideAction} className={sectionClass}>
              <input type="hidden" name="redirect_to" value={redirectTarget} />
              <input type="hidden" name="admin_user_id" value={selectedAdminId} />
              <h3 className="text-lg font-semibold text-slate-950">Add block or extra time</h3>
              <label className={`${labelClass} mt-4`}>
                Type
                <select name="override_type" className={inputClass} defaultValue="blocked">
                  <option value="blocked">Blocked time</option>
                  <option value="extra_available">Extra available time</option>
                </select>
              </label>
              <label className={`${labelClass} mt-4`}>
                Starts
                <input name="starts_at" type="datetime-local" className={inputClass} required />
              </label>
              <label className={`${labelClass} mt-4`}>
                Ends
                <input name="ends_at" type="datetime-local" className={inputClass} required />
              </label>
              <label className={`${labelClass} mt-4`}>
                Reason
                <input name="reason" className={inputClass} placeholder="Holiday, client visit, extra opening..." />
              </label>
              <button className="mt-5 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Add time rule</button>
            </form>

            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Upcoming blocked and extra time</div>
              <div className="divide-y divide-slate-100">
                {overrides.map((override) => (
                  <div key={override.id} className="flex flex-col gap-3 px-5 py-4 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="font-semibold text-slate-950">{override.override_type.replaceAll("_", " ")}</div>
                      <div className="mt-1 text-slate-600">
                        {datetimeLocal(override.starts_at).replace("T", " ")} - {datetimeLocal(override.ends_at).replace("T", " ")}
                      </div>
                      {override.reason ? <div className="mt-1 text-slate-500">{override.reason}</div> : null}
                    </div>
                    <form action={deleteAvailabilityOverrideAction}>
                      <input type="hidden" name="redirect_to" value={redirectTarget} />
                      <input type="hidden" name="id" value={override.id} />
                      <input type="hidden" name="admin_user_id" value={selectedAdminId} />
                      <ConfirmSubmitButton
                        message="Delete this availability override?"
                        className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                      >
                        Delete
                      </ConfirmSubmitButton>
                    </form>
                  </div>
                ))}
                {overrides.length === 0 ? <div className="px-5 py-6 text-sm text-slate-500">No upcoming overrides.</div> : null}
              </div>
            </div>
          </section>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-950">Slot preview</h3>
            <p className="mt-1 text-sm text-slate-500">
              {selectedLink ? `${selectedLink.name} · /book/${selectedLink.slug}` : "Create a booking link to preview slots."}
            </p>
          </div>
          <div className="max-h-[760px] space-y-5 overflow-auto p-5">
            {groupedSlots.map(([date, slots]) => (
              <div key={date}>
                <div className="mb-2 text-sm font-semibold text-slate-700">{displayDate(date)}</div>
                <div className="grid grid-cols-2 gap-2">
                  {slots.map((slot) => (
                    <div key={slot.start_at} className="rounded-md border border-cyan-100 bg-cyan-50 px-3 py-2 text-center text-xs font-semibold text-cyan-800">
                      {slot.label}
                    </div>
                  ))}
                </div>
              </div>
            ))}
            {selectedLink && groupedSlots.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No available slots in the next 14 days. Check weekly hours, blocks, booking-window, minimum notice, and active status.
              </div>
            ) : null}
            {!selectedLink ? (
              <Link href="/admin/calendar/links" className="block rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-center text-sm font-semibold text-cyan-800">
                Create booking link
              </Link>
            ) : null}
          </div>
        </aside>
      </div>
    </AdminShell>
  );
}
