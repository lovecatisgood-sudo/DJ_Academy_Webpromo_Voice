import Link from "next/link";
import { AdminShell } from "../../AdminShell";
import {
  createAvailabilityOverrideAction,
  createBookingLinkAction,
  setActiveAiBookingLinkAction,
  updateCalendarProfileAction,
  updateWeeklyAvailabilityAction,
} from "../../actions";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

const inputClass = "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";
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

export default async function CalendarSetupPage({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string; saved?: string; error?: string }>;
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
    display_name: string;
    booking_slug: string;
    timezone: string;
    meeting_location: string | null;
    is_active: boolean;
    allow_admin_self_edit: boolean;
  }[];
  const [ruleCount] = (await sql`
    select count(*)::int as count
    from availability_rules
    where admin_user_id = ${selectedAdminId}
      and is_active = true
  `) as { count: number }[];
  const rules = (await sql`
    select weekday, start_time::text as start_time, end_time::text as end_time
    from availability_rules
    where admin_user_id = ${selectedAdminId}
      and is_active = true
    order by weekday, start_time
  `) as { weekday: number; start_time: string; end_time: string }[];
  const links = (await sql`
    select id, name, slug, title, duration_minutes, is_ai_active
    from booking_links
    where owner_admin_id = ${selectedAdminId}
      and deleted_at is null
    order by is_ai_active desc, created_at desc
  `) as { id: string; name: string; slug: string; title: string; duration_minutes: number; is_ai_active: boolean }[];
  const setupItems = [
    { label: "Calendar profile", done: Boolean(profile) },
    { label: "Weekly availability", done: (ruleCount?.count ?? 0) > 0 },
    { label: "Booking link", done: links.length > 0 },
    { label: "AI active link", done: links.some((item) => item.is_ai_active), masterOnly: true },
  ].filter((item) => admin.role === "master_admin" || !item.masterOnly);
  const redirectTarget = `/admin/calendar/setup?admin=${encodeURIComponent(selectedAdminId)}`;

  return (
    <AdminShell>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Set up calendar</h2>
          <p className="mt-1 text-sm text-slate-600">
            Create the calendar profile, open appointment hours, and booking link before sending visitors to book.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/calendar" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Calendar</Link>
          <Link href="/admin/calendar/links" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Booking links</Link>
        </div>
      </div>

      {params.error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Setup update failed: {params.error.replaceAll("_", " ")}.
        </div>
      ) : null}
      {params.saved ? (
        <div className="mb-5 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Calendar setup saved.
        </div>
      ) : null}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-950">Setup checklist</h3>
            <p className="mt-1 text-sm text-slate-600">Editing setup for {selectedAdmin?.name || admin.name}.</p>
          </div>
          {admin.role === "master_admin" ? (
            <form>
              <select name="admin" defaultValue={selectedAdminId} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm">
                {adminRows.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.username})</option>)}
              </select>
              <button className="ml-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Switch</button>
            </form>
          ) : null}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4">
          {setupItems.map((item, index) => (
            <div key={item.label} className={`rounded-lg border px-4 py-3 ${item.done ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
              <div className="text-xs font-semibold text-slate-500">Step {index + 1}</div>
              <div className="mt-1 font-semibold text-slate-950">{item.label}</div>
              <div className={`mt-1 text-xs font-semibold ${item.done ? "text-emerald-700" : "text-amber-800"}`}>
                {item.done ? "Ready" : "Needs setup"}
              </div>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <form action={updateCalendarProfileAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="redirect_to" value={redirectTarget} />
          <input type="hidden" name="admin_user_id" value={selectedAdminId} />
          <h3 className="text-lg font-semibold text-slate-950">1. Calendar profile</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Display name
              <input name="display_name" defaultValue={profile?.display_name || selectedAdmin?.name || admin.name} className={inputClass} required />
            </label>
            <label className={labelClass}>
              Booking slug compatibility
              <input name="booking_slug" defaultValue={profile?.booking_slug || selectedAdmin?.username || admin.username} className={inputClass} required />
            </label>
            <label className={labelClass}>
              Timezone
              <input name="timezone" defaultValue={profile?.timezone || "Asia/Bangkok"} className={inputClass} />
            </label>
            <label className={labelClass}>
              Default meeting location/link
              <input name="meeting_location" defaultValue={profile?.meeting_location || ""} className={inputClass} />
            </label>
            <input type="hidden" name="meeting_title" value="ปรึกษากับ DJAI" />
            <input type="hidden" name="default_duration_minutes" value="30" />
            <input type="hidden" name="buffer_before_minutes" value="0" />
            <input type="hidden" name="buffer_after_minutes" value="0" />
            <input type="hidden" name="minimum_notice_minutes" value="240" />
            <input type="hidden" name="booking_window_days" value="30" />
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
          <button className="mt-5 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Save profile</button>
        </form>

        <form action={updateWeeklyAvailabilityAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="redirect_to" value={redirectTarget} />
          <input type="hidden" name="admin_user_id" value={selectedAdminId} />
          <h3 className="text-lg font-semibold text-slate-950">2. Weekly availability</h3>
          <p className="mt-1 text-sm text-slate-600">Set your default open appointment hours. Leave a day empty if unavailable.</p>
          <div className="mt-4 divide-y divide-slate-100">
            {weekdays.map(([weekday, label]) => {
              const dayRules = rules.filter((rule) => rule.weekday === Number(weekday));
              const hasSavedRules = rules.length > 0;
              const firstDefaultStart = dayRules[0]?.start_time?.slice(0, 5) || (!hasSavedRules && ["1", "2", "3", "4", "5"].includes(weekday) ? "10:00" : "");
              const firstDefaultEnd = dayRules[0]?.end_time?.slice(0, 5) || (!hasSavedRules && ["1", "2", "3", "4", "5"].includes(weekday) ? "17:00" : "");

              return (
                <div key={weekday} className="grid gap-3 py-3 md:grid-cols-[110px_1fr_1fr] md:items-center">
                  <div className="font-semibold text-slate-700">{label}</div>
                  <input name={`day_${weekday}_start_1`} type="time" defaultValue={firstDefaultStart} className={inputClass} />
                  <input name={`day_${weekday}_end_1`} type="time" defaultValue={firstDefaultEnd} className={inputClass} />
                  <div className="hidden md:block" />
                  <input name={`day_${weekday}_start_2`} type="time" defaultValue={dayRules[1]?.start_time?.slice(0, 5) || ""} className={inputClass} />
                  <input name={`day_${weekday}_end_2`} type="time" defaultValue={dayRules[1]?.end_time?.slice(0, 5) || ""} className={inputClass} />
                </div>
              );
            })}
          </div>
          <button className="mt-5 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Save weekly hours</button>
        </form>

        <form action={createAvailabilityOverrideAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="redirect_to" value={redirectTarget} />
          <input type="hidden" name="admin_user_id" value={selectedAdminId} />
          <h3 className="text-lg font-semibold text-slate-950">3. Block busy time</h3>
          <p className="mt-1 text-sm text-slate-600">Optional. Add a busy period so customers cannot book it.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <input type="hidden" name="override_type" value="blocked" />
            <label className={labelClass}>
              Starts
              <input name="starts_at" type="datetime-local" className={inputClass} required />
            </label>
            <label className={labelClass}>
              Ends
              <input name="ends_at" type="datetime-local" className={inputClass} required />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Reason
              <input name="reason" placeholder="Client visit, holiday, focus time..." className={inputClass} />
            </label>
          </div>
          <button className="mt-5 rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700">Add blocked time</button>
        </form>

        <form action={createBookingLinkAction} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="redirect_to" value={redirectTarget} />
          <input type="hidden" name="owner_admin_id" value={selectedAdminId} />
          <h3 className="text-lg font-semibold text-slate-950">4. Create booking link</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Link name
              <input name="name" defaultValue="ปรึกษาเบื้องต้นฟรี" className={inputClass} required />
            </label>
            <label className={labelClass}>
              Public slug
              <input name="slug" defaultValue={`${selectedAdmin?.username || admin.username}-consultation`} className={inputClass} required />
            </label>
            <label className={labelClass}>
              Duration
              <select name="duration_minutes" defaultValue="30" className={inputClass}>
                <option value="15">15 minutes</option>
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">60 minutes</option>
                <option value="90">90 minutes</option>
                <option value="120">2 hours</option>
              </select>
            </label>
            <label className={labelClass}>
              Meeting title
              <input name="title" defaultValue="ปรึกษากับ DJAI" className={inputClass} required />
            </label>
            <label className={`${labelClass} md:col-span-2`}>
              Meeting location/link
              <input name="meeting_location" defaultValue={profile?.meeting_location || ""} className={inputClass} />
            </label>
            <input type="hidden" name="minimum_notice_minutes" value="240" />
            <input type="hidden" name="booking_window_days" value="30" />
            <input type="hidden" name="buffer_before_minutes" value="0" />
            <input type="hidden" name="buffer_after_minutes" value="0" />
            <input type="hidden" name="require_confirmation" value="off" />
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input name="require_confirmation" type="checkbox" defaultChecked />
              Require admin confirmation
            </label>
            {admin.role === "master_admin" ? (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input name="set_ai_active" type="checkbox" defaultChecked={links.length === 0} />
                Set as AI booking link
              </label>
            ) : null}
          </div>
          <button className="mt-5 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Create booking link</button>
        </form>
      </div>

      {links.length ? (
        <section className="mt-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Existing links</h3>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {links.map((link) => (
              <div key={link.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="font-semibold text-slate-950">{link.name}</div>
                <div className="mt-1 text-sm text-slate-600">/book/{link.slug} · {link.duration_minutes} min</div>
                {link.is_ai_active ? <div className="mt-2 text-xs font-semibold text-cyan-700">Active AI booking link</div> : null}
                {admin.role === "master_admin" && !link.is_ai_active ? (
                  <form action={setActiveAiBookingLinkAction} className="mt-3">
                    <input type="hidden" name="redirect_to" value={redirectTarget} />
                    <input type="hidden" name="booking_link_id" value={link.id} />
                    <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-xs font-semibold text-cyan-800">
                      Set as AI booking link
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </AdminShell>
  );
}
