import Link from "next/link";
import { AdminShell } from "../AdminShell";
import {
  cancelAppointmentAction,
  confirmAppointmentAction,
  markAppointmentCompletedAction,
  markAppointmentNoShowAction,
  reassignAppointmentAction,
  rejectAppointmentAction,
  rescheduleAppointmentAction,
  updateAppointmentNotesAction,
} from "../actions";
import { ConfirmSubmitButton } from "../ConfirmSubmitButton";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { AppointmentStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type StatusFilter = "active" | "pending_confirmation" | "confirmed" | "completed" | "cancelled" | "all";

const statusOptions: { key: StatusFilter; label: string }[] = [
  { key: "active", label: "Active" },
  { key: "pending_confirmation", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "completed", label: "Completed" },
  { key: "cancelled", label: "Cancelled" },
  { key: "all", label: "All" },
];

function statusValue(value: unknown): StatusFilter {
  return value === "pending_confirmation" ||
    value === "confirmed" ||
    value === "completed" ||
    value === "cancelled" ||
    value === "all"
    ? value
    : "active";
}

function dateKeyInBangkok(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseAnchorDate(value: string | undefined) {
  if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return new Date(`${value}T00:00:00+07:00`);
  return new Date();
}

function weekStart(anchor: Date) {
  const local = new Date(anchor.getTime() + 7 * 60 * 60 * 1000);
  const localDay = local.getUTCDay();
  const diff = (localDay + 6) % 7;
  const localMidnightUtc = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  return new Date(localMidnightUtc - diff * 24 * 60 * 60 * 1000 - 7 * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function displayDay(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", timeZone: "Asia/Bangkok" });
}

function timeLabel(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Bangkok" });
}

function datetimeLocal(value: string) {
  const local = new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function statusClass(status: string) {
  if (status === "pending_confirmation") return "border-amber-200 bg-amber-50 text-amber-900";
  if (status === "confirmed") return "border-cyan-200 bg-cyan-50 text-cyan-900";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-900";
  if (status === "no_show") return "border-red-200 bg-red-50 text-red-700";
  if (status === "cancelled" || status === "rejected") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-white text-slate-700";
}

function eventPosition(startAt: string, endAt: string, minHour: number, maxHour: number) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const startLocal = new Date(start.getTime() + 7 * 60 * 60 * 1000);
  const endLocal = new Date(end.getTime() + 7 * 60 * 60 * 1000);
  const totalMinutes = (maxHour - minHour) * 60;
  const startMinutes = startLocal.getUTCHours() * 60 + startLocal.getUTCMinutes() - minHour * 60;
  const endMinutes = endLocal.getUTCHours() * 60 + endLocal.getUTCMinutes() - minHour * 60;
  const top = Math.max(0, Math.min(100, (startMinutes / totalMinutes) * 100));
  const height = Math.max(4.5, Math.min(100 - top, ((endMinutes - startMinutes) / totalMinutes) * 100));

  return { top: `${top}%`, height: `${height}%` };
}

function appointmentContactLine(appointment: {
  email: string;
  phone: string | null;
  line_id: string | null;
  whatsapp: string | null;
}) {
  return [
    appointment.email,
    appointment.phone ? `Phone ${appointment.phone}` : "",
    appointment.line_id ? `LINE ${appointment.line_id}` : "",
    appointment.whatsapp ? `WhatsApp ${appointment.whatsapp}` : "",
  ].filter(Boolean).join(" · ");
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; status?: StatusFilter; admin?: string; q?: string; selected?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const sql = getSql();
  const status = statusValue(params.status);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const search = `%${q}%`;
  const anchor = parseAnchorDate(params.date);
  const start = weekStart(anchor);
  const end = addDays(start, 7);
  const days = Array.from({ length: 7 }, (_, index) => addDays(start, index));
  const currentWeekDate = dateKeyInBangkok(start);
  const prevDate = dateKeyInBangkok(addDays(start, -7));
  const nextDate = dateKeyInBangkok(addDays(start, 7));
  const adminRows = admin.role === "master_admin"
    ? (await sql`
        select id, name, username
        from admin_users
        where is_active = true
          and deleted_at is null
        order by role desc, name asc
      `) as { id: string; name: string; username: string }[]
    : [];
  const adminFilter = admin.role === "master_admin" && params.admin && adminRows.some((item) => item.id === params.admin)
    ? params.admin
    : "";
  const adminFilterId = adminFilter || null;
  const appointments = (await sql`
    select
      a.*,
      au.name as assigned_admin_name,
      au.username as assigned_admin_username,
      bl.name as booking_link_name,
      bl.slug as booking_link_slug,
      l.status as lead_status,
      c.summary,
      c.main_problem,
      c.recommended_service,
      c.interest_level
    from appointments a
    left join admin_users au on au.id = a.assigned_admin_id
    left join booking_links bl on bl.id = a.booking_link_id
    left join leads l on l.id = a.lead_id
    left join conversations c on c.id = a.conversation_id
    where a.deleted_at is null
      and a.start_at < ${end.toISOString()}
      and a.end_at > ${start.toISOString()}
      and (
        ${admin.role === "master_admin"}::boolean
        or a.assigned_admin_id = ${admin.id}
      )
      and (${adminFilterId}::uuid is null or a.assigned_admin_id = ${adminFilterId}::uuid)
      and (
        ${status} = 'all'
        or (${status} = 'active' and a.status in ('pending_confirmation', 'confirmed'))
        or a.status = ${status}
      )
      and (
        ${q} = ''
        or coalesce(a.client_name, '') ilike ${search}
        or coalesce(a.company_name, '') ilike ${search}
        or coalesce(a.email, '') ilike ${search}
        or coalesce(a.phone, '') ilike ${search}
        or coalesce(a.line_id, '') ilike ${search}
        or coalesce(c.main_problem, '') ilike ${search}
        or coalesce(c.recommended_service, '') ilike ${search}
      )
    order by a.start_at asc
    limit 250
  `) as {
    id: string;
    lead_id: string | null;
    conversation_id: string | null;
    assigned_admin_id: string | null;
    assigned_admin_name_snapshot: string | null;
    assigned_admin_name: string | null;
    assigned_admin_username: string | null;
    booking_link_name: string | null;
    booking_link_slug: string | null;
    status: AppointmentStatus;
    source: string;
    start_at: string;
    end_at: string;
    timezone: string;
    duration_minutes: number;
    client_name: string;
    company_name: string | null;
    email: string;
    phone: string | null;
    line_id: string | null;
    whatsapp: string | null;
    note: string | null;
    meeting_location: string | null;
    admin_notes: string | null;
    lead_status: string | null;
    summary: string | null;
    main_problem: string | null;
    recommended_service: string | null;
    interest_level: string | null;
  }[];
  const blockedTimes = (await sql`
    select
      ao.id,
      ao.starts_at,
      ao.ends_at,
      ao.reason,
      au.name as admin_name
    from availability_overrides ao
    left join admin_users au on au.id = ao.admin_user_id
    where ao.override_type = 'blocked'
      and ao.starts_at < ${end.toISOString()}
      and ao.ends_at > ${start.toISOString()}
      and (
        ${admin.role === "master_admin"}::boolean
        or ao.admin_user_id = ${admin.id}
      )
      and (${adminFilterId}::uuid is null or ao.admin_user_id = ${adminFilterId}::uuid)
    order by ao.starts_at asc
    limit 200
  `) as { id: string; starts_at: string; ends_at: string; reason: string | null; admin_name: string | null }[];
  const [setupState] = (await sql`
    select
      count(distinct acp.admin_user_id) filter (where acp.is_active = true)::int as active_profiles,
      count(distinct ar.id) filter (where ar.is_active = true)::int as active_rules,
      count(distinct bl.id) filter (where bl.is_active = true and bl.deleted_at is null)::int as active_links,
      count(distinct bl.id) filter (where bl.is_ai_active = true and bl.is_active = true and bl.deleted_at is null)::int as ai_links
    from admin_users au
    left join admin_calendar_profiles acp on acp.admin_user_id = au.id
    left join availability_rules ar on ar.admin_user_id = au.id
    left join booking_links bl on bl.owner_admin_id = au.id
    where au.deleted_at is null
      and au.is_active = true
      and (
        ${admin.role === "master_admin"}::boolean
        or au.id = ${admin.id}
      )
      and (${adminFilterId}::uuid is null or au.id = ${adminFilterId}::uuid)
  `) as { active_profiles: number; active_rules: number; active_links: number; ai_links: number }[];
  const selectedAppointment = appointments.find((item) => item.id === params.selected) ||
    appointments.find((item) => item.status === "pending_confirmation") ||
    appointments[0] ||
    null;
  const currentQuery = `date=${currentWeekDate}&status=${status}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const minHour = 8;
  const maxHour = 21;
  const hours = Array.from({ length: maxHour - minHour }, (_, index) => minHour + index);

  return (
    <AdminShell>
      {params.error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Calendar action failed: {params.error.replaceAll("_", " ")}.
        </div>
      ) : null}
      {admin.role === "master_admin" && (setupState?.active_profiles === 0 || setupState?.active_rules === 0 || setupState?.active_links === 0 || setupState?.ai_links === 0) ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Calendar setup is incomplete. You need an active profile, weekly hours, booking link, and one AI active booking link.
          <Link href="/admin/calendar/setup" className="ml-2 font-semibold underline">Open setup</Link>
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Calendar</h2>
          <p className="mt-1 text-sm text-slate-600">
            Review appointments, confirm requests, and manage blocked time from one weekly schedule.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/calendar/setup" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Setup</Link>
          <Link href="/admin/calendar/availability" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Availability</Link>
          <Link href="/admin/calendar/links" className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">Booking links</Link>
        </div>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/admin/calendar?date=${prevDate}&status=${status}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Previous</Link>
            <Link href={`/admin/calendar?status=${status}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="rounded-md border border-slate-900 bg-slate-950 px-3 py-2 text-sm font-semibold text-white">Today</Link>
            <Link href={`/admin/calendar?date=${nextDate}&status=${status}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Next</Link>
            <div className="ml-2 text-sm font-semibold text-slate-700">
              {displayDay(start)} - {displayDay(addDays(start, 6))}
            </div>
          </div>

          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="date" value={currentWeekDate} />
            <select name="status" defaultValue={status} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
              {statusOptions.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
            </select>
            {admin.role === "master_admin" ? (
              <select name="admin" defaultValue={adminFilter} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                <option value="">All admins</option>
                {adminRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            ) : null}
            <input name="q" defaultValue={q} placeholder="Search customer or issue" className="w-60 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm" />
            <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Apply</button>
          </form>
        </div>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[1fr_420px]">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="grid grid-cols-[64px_repeat(7,minmax(124px,1fr))] border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-600">
            <div className="border-r border-slate-200 px-2 py-3">GMT+7</div>
            {days.map((day) => (
              <div key={day.toISOString()} className="border-r border-slate-200 px-3 py-3 last:border-r-0">
                <div>{displayDay(day)}</div>
                <div className="mt-1 text-[11px] font-normal text-slate-500">{dateKeyInBangkok(day)}</div>
              </div>
            ))}
          </div>
          <div className="max-w-full overflow-x-auto">
            <div className="grid min-w-[980px] grid-cols-[64px_repeat(7,minmax(124px,1fr))]">
              <div className="border-r border-slate-200 bg-slate-50">
                {hours.map((hour) => (
                  <div key={hour} className="h-16 border-b border-slate-200 px-2 pt-1 text-xs text-slate-500">
                    {String(hour).padStart(2, "0")}:00
                  </div>
                ))}
              </div>
              {days.map((day) => {
                const dayKey = dateKeyInBangkok(day);
                const dayAppointments = appointments.filter((appointment) => dateKeyInBangkok(appointment.start_at) === dayKey);
                const dayBlocks = blockedTimes.filter((block) => dateKeyInBangkok(block.starts_at) === dayKey);

                return (
                  <div key={dayKey} className="relative min-h-[832px] border-r border-slate-200 last:border-r-0">
                    {hours.map((hour) => <div key={hour} className="h-16 border-b border-slate-100" />)}
                    {dayBlocks.map((block) => (
                      <div
                        key={block.id}
                        style={eventPosition(block.starts_at, block.ends_at, minHour, maxHour)}
                        className="absolute left-1 right-1 overflow-hidden rounded-md border border-slate-300 bg-slate-100 px-2 py-1 text-[11px] text-slate-600"
                      >
                        <div className="font-semibold">Blocked</div>
                        <div>{timeLabel(block.starts_at)} - {timeLabel(block.ends_at)}</div>
                        <div className="truncate">{block.reason || block.admin_name || "Busy"}</div>
                      </div>
                    ))}
                    {dayAppointments.map((appointment, index) => (
                      <Link
                        key={appointment.id}
                        href={`/admin/calendar?${currentQuery}&selected=${appointment.id}`}
                        style={{
                          ...eventPosition(appointment.start_at, appointment.end_at, minHour, maxHour),
                          left: `${4 + (index % 2) * 5}%`,
                          right: `${4 + ((index + 1) % 2) * 5}%`,
                        }}
                        className={`absolute overflow-hidden rounded-md border px-2 py-1 text-[11px] shadow-sm transition hover:shadow-md ${statusClass(appointment.status)}`}
                      >
                        <div className="truncate font-semibold">{timeLabel(appointment.start_at)} · {appointment.client_name}</div>
                        <div className="truncate">{appointment.company_name || appointment.main_problem || appointment.email}</div>
                        <div className="truncate">{appointment.assigned_admin_name || appointment.assigned_admin_name_snapshot || "Unassigned"}</div>
                      </Link>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <aside className="rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4">
            <h3 className="font-semibold text-slate-950">Appointment detail</h3>
            <p className="mt-1 text-sm text-slate-500">Confirm, reject, reschedule, reassign, or add notes.</p>
          </div>
          {selectedAppointment ? (
            <div className="space-y-4 p-5 text-sm">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-lg font-semibold text-slate-950">{selectedAppointment.client_name}</h4>
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(selectedAppointment.status)}`}>
                    {selectedAppointment.status.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-1 text-slate-600">{selectedAppointment.company_name || "No company captured"}</div>
                <div className="mt-2 text-slate-700">
                  {timeLabel(selectedAppointment.start_at)} - {timeLabel(selectedAppointment.end_at)} · {selectedAppointment.duration_minutes} min
                </div>
                <div className="mt-2 text-slate-600">{appointmentContactLine(selectedAppointment)}</div>
              </div>

              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
	                <div>Assigned: {selectedAppointment.assigned_admin_name || selectedAppointment.assigned_admin_name_snapshot || "Unassigned"}</div>
	                <div>Booking link: {selectedAppointment.booking_link_name || selectedAppointment.booking_link_slug || "Unknown"}</div>
	                <div>Source: {selectedAppointment.source.replaceAll("_", " ")}</div>
	                <div>Interest: {selectedAppointment.interest_level || "unknown"}</div>
	                <div>Lead status: {selectedAppointment.lead_status || "none"}</div>
	              </div>

              <div className="grid gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
                <div><span className="font-semibold text-slate-700">Problem:</span> {selectedAppointment.main_problem || selectedAppointment.summary || "Not captured"}</div>
                <div><span className="font-semibold text-slate-700">Service:</span> {selectedAppointment.recommended_service || "Not captured"}</div>
                {selectedAppointment.note ? <div><span className="font-semibold text-slate-700">Client note:</span> {selectedAppointment.note}</div> : null}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedAppointment.status === "pending_confirmation" ? (
                  <>
                    <form action={confirmAppointmentAction}>
                      <input type="hidden" name="id" value={selectedAppointment.id} />
                      <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}&selected=${selectedAppointment.id}`} />
                      <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">Confirm</button>
                    </form>
                    <form action={rejectAppointmentAction}>
                      <input type="hidden" name="id" value={selectedAppointment.id} />
                      <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}`} />
                      <ConfirmSubmitButton message="Reject this appointment?" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                        Reject
                      </ConfirmSubmitButton>
                    </form>
                  </>
                ) : null}
                {selectedAppointment.status === "confirmed" ? (
                  <>
                    <form action={markAppointmentCompletedAction}>
                      <input type="hidden" name="id" value={selectedAppointment.id} />
                      <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}&selected=${selectedAppointment.id}`} />
                      <button className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">Complete</button>
                    </form>
                    <form action={markAppointmentNoShowAction}>
                      <input type="hidden" name="id" value={selectedAppointment.id} />
                      <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}&selected=${selectedAppointment.id}`} />
                      <button className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">No-show</button>
                    </form>
                  </>
                ) : null}
                {selectedAppointment.status === "pending_confirmation" || selectedAppointment.status === "confirmed" ? (
                  <form action={cancelAppointmentAction}>
                    <input type="hidden" name="id" value={selectedAppointment.id} />
                    <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}`} />
                    <ConfirmSubmitButton message="Cancel this appointment?" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      Cancel
                    </ConfirmSubmitButton>
                  </form>
                ) : null}
              </div>

              <form action={rescheduleAppointmentAction} className="grid gap-2 sm:grid-cols-[1fr_88px]">
                <input type="hidden" name="id" value={selectedAppointment.id} />
                <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}&selected=${selectedAppointment.id}`} />
                <input name="start_at" type="datetime-local" defaultValue={datetimeLocal(selectedAppointment.start_at)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                <input name="duration_minutes" type="number" min={10} max={240} defaultValue={selectedAppointment.duration_minutes} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 sm:col-span-2">Reschedule</button>
              </form>

              {admin.role === "master_admin" ? (
                <form action={reassignAppointmentAction} className="flex gap-2">
                  <input type="hidden" name="id" value={selectedAppointment.id} />
                  <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}&selected=${selectedAppointment.id}`} />
                  <select name="assigned_admin_id" defaultValue={selectedAppointment.assigned_admin_id || ""} className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                    <option value="">Unassigned</option>
                    {adminRows.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Reassign</button>
                </form>
              ) : null}

              <form action={updateAppointmentNotesAction} className="grid gap-2">
                <input type="hidden" name="id" value={selectedAppointment.id} />
                <input type="hidden" name="redirect_to" value={`/admin/calendar?${currentQuery}&selected=${selectedAppointment.id}`} />
                <textarea name="admin_notes" rows={4} defaultValue={selectedAppointment.admin_notes || ""} placeholder="Internal appointment notes" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">Save notes</button>
              </form>

              <div className="flex flex-wrap gap-3 text-xs">
                {selectedAppointment.conversation_id ? <Link href={`/admin/conversations/${selectedAppointment.conversation_id}`} className="font-semibold text-cyan-700">Open conversation</Link> : null}
                {selectedAppointment.lead_id ? <Link href="/admin/leads" className="font-semibold text-cyan-700">Open leads</Link> : null}
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">No appointment in this week. Use Booking links to share a public scheduler.</div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
