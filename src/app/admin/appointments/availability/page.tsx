import Link from "next/link";
import { AdminShell } from "../../AdminShell";
import {
  createAvailabilityOverrideAction,
  deleteAvailabilityOverrideAction,
  updateCalendarProfileAction,
  updateWeeklyAvailabilityAction,
} from "../../actions";
import { ConfirmSubmitButton } from "../../ConfirmSubmitButton";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

const inputClass = "mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm";
const compactInputClass = "rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";
const sectionClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const weekdays = [
  ["0", "Sunday"],
  ["1", "Monday"],
  ["2", "Tuesday"],
  ["3", "Wednesday"],
  ["4", "Thursday"],
  ["5", "Friday"],
  ["6", "Saturday"],
] as const;

function datetimeLocal(value: string) {
  const local = new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

export default async function AvailabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ admin?: string; error?: string; saved?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const sql = getSql();
  const admins = admin.role === "master_admin"
    ? (await sql`
        select id, name, username
        from admin_users
        where is_active = true
          and deleted_at is null
        order by role desc, name asc
      `) as { id: string; name: string; username: string }[]
    : [{ id: admin.id, name: admin.name, username: admin.username }];
  const selectedAdminId = admin.role === "master_admin" && params.admin && admins.some((item) => item.id === params.admin)
    ? params.admin
    : admin.role === "master_admin"
      ? admins[0]?.id
      : admin.id;

  if (!selectedAdminId) {
    return (
      <AdminShell>
        <div className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600 shadow-sm">
          No active admin is available for calendar setup.
        </div>
      </AdminShell>
    );
  }

  const [profile] = (await sql`
    select *
    from admin_calendar_profiles
    where admin_user_id = ${selectedAdminId}
    limit 1
  `) as {
    id: string;
    admin_user_id: string;
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
  const selectedAdmin = admins.find((item) => item.id === selectedAdminId);

  return (
    <AdminShell>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Availability</h2>
          <p className="mt-1 text-sm text-slate-600">
            Manage bookable hours and blocked time for {selectedAdmin?.name || "admin"}.
          </p>
        </div>
        <Link href="/admin/appointments" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">
          Back to appointments
        </Link>
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

      {admin.role === "master_admin" ? (
        <form className={`mb-5 ${sectionClass}`}>
          <label className="block text-sm font-medium text-slate-700">
            Editing admin
            <select name="admin" defaultValue={selectedAdminId} className={inputClass}>
              {admins.map((item) => (
                <option key={item.id} value={item.id}>{item.name} ({item.username})</option>
              ))}
            </select>
          </label>
          <button className="mt-3 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">Switch admin</button>
        </form>
      ) : null}

      <form action={updateCalendarProfileAction} className={`mb-5 ${sectionClass}`}>
        <input type="hidden" name="admin_user_id" value={selectedAdminId} />
        <h3 className="text-lg font-semibold text-slate-950">Calendar profile</h3>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700">
            Display name
            <input name="display_name" defaultValue={profile?.display_name || selectedAdmin?.name || ""} className={inputClass} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Booking slug
            <input name="booking_slug" defaultValue={profile?.booking_slug || selectedAdmin?.username || ""} className={inputClass} required />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Timezone
            <input name="timezone" defaultValue={profile?.timezone || "Asia/Bangkok"} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Meeting title
            <input name="meeting_title" defaultValue={profile?.meeting_title || "ปรึกษากับ DJAI"} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Meeting location/link
            <input name="meeting_location" defaultValue={profile?.meeting_location || ""} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Duration minutes
            <input name="default_duration_minutes" type="number" min={10} max={240} defaultValue={profile?.default_duration_minutes || 30} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Buffer before
            <input name="buffer_before_minutes" type="number" min={0} max={120} defaultValue={profile?.buffer_before_minutes || 0} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Buffer after
            <input name="buffer_after_minutes" type="number" min={0} max={120} defaultValue={profile?.buffer_after_minutes || 0} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Minimum notice
            <input name="minimum_notice_minutes" type="number" min={0} max={10080} defaultValue={profile?.minimum_notice_minutes ?? 240} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Max bookings/day
            <input name="max_bookings_per_day" type="number" min={1} max={50} defaultValue={profile?.max_bookings_per_day || ""} className={inputClass} />
          </label>
          <label className="block text-sm font-medium text-slate-700">
            Booking window days
            <input name="booking_window_days" type="number" min={1} max={365} defaultValue={profile?.booking_window_days || 30} className={inputClass} />
          </label>
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
        <button className="mt-5 rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white">
          Save profile
        </button>
      </form>

      <form action={updateWeeklyAvailabilityAction} className={`mb-5 ${sectionClass}`}>
        <input type="hidden" name="admin_user_id" value={selectedAdminId} />
        <h3 className="text-lg font-semibold text-slate-950">Weekly availability</h3>
        <div className="mt-5 divide-y divide-slate-100">
          {weekdays.map(([weekday, label]) => {
            const dayRules = rules.filter((rule) => rule.weekday === Number(weekday));
            return (
              <div key={weekday} className="grid gap-3 py-4 md:grid-cols-[140px_1fr_1fr] md:items-center">
                <div className="font-semibold text-slate-700">{label}</div>
                {[1, 2].map((slot) => {
                  const rule = dayRules[slot - 1];
                  return (
                    <div key={slot} className="grid grid-cols-2 gap-2">
                      <input
                        name={`day_${weekday}_start_${slot}`}
                        type="time"
                        defaultValue={rule?.start_time?.slice(0, 5) || ""}
                        className={compactInputClass}
                      />
                      <input
                        name={`day_${weekday}_end_${slot}`}
                        type="time"
                        defaultValue={rule?.end_time?.slice(0, 5) || ""}
                        className={compactInputClass}
                      />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <button className="mt-5 rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white">
          Save weekly hours
        </button>
      </form>

      <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
        <form action={createAvailabilityOverrideAction} className={sectionClass}>
          <input type="hidden" name="admin_user_id" value={selectedAdminId} />
          <h3 className="text-lg font-semibold text-slate-950">Add override</h3>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Type
            <select name="override_type" className={inputClass} defaultValue="blocked">
              <option value="blocked">Blocked time</option>
              <option value="extra_available">Extra available</option>
            </select>
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Starts
            <input name="starts_at" type="datetime-local" className={inputClass} required />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Ends
            <input name="ends_at" type="datetime-local" className={inputClass} required />
          </label>
          <label className="mt-4 block text-sm font-medium text-slate-700">
            Reason
            <input name="reason" className={inputClass} />
          </label>
          <button className="mt-5 rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white">
            Add override
          </button>
        </form>

        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Upcoming overrides</div>
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
    </AdminShell>
  );
}
