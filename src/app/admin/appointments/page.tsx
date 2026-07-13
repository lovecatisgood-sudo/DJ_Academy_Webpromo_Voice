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

type StatusFilter = "all" | AppointmentStatus;
type RangeFilter = "today" | "week" | "month" | "upcoming" | "all";
type ViewFilter = "list" | "calendar";

const statuses: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_confirmation", label: "Pending" },
  { key: "confirmed", label: "Confirmed" },
  { key: "rejected", label: "Rejected" },
  { key: "cancelled", label: "Cancelled" },
  { key: "completed", label: "Completed" },
  { key: "no_show", label: "No-show" },
];

const ranges: { key: RangeFilter; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "upcoming", label: "Upcoming" },
  { key: "all", label: "All" },
];

function statusValue(value: unknown): StatusFilter {
  return value === "pending_confirmation" ||
    value === "confirmed" ||
    value === "rejected" ||
    value === "cancelled" ||
    value === "completed" ||
    value === "no_show"
    ? value
    : "all";
}

function rangeValue(value: unknown): RangeFilter {
  return value === "week" || value === "month" || value === "upcoming" || value === "all" ? value : "today";
}

function viewValue(value: unknown): ViewFilter {
  return value === "calendar" ? "calendar" : "list";
}

function statusClass(status: string) {
  if (status === "pending_confirmation") return "border-amber-200 bg-amber-50 text-amber-800";
  if (status === "confirmed") return "border-cyan-200 bg-cyan-50 text-cyan-800";
  if (status === "completed") return "border-emerald-200 bg-emerald-50 text-emerald-800";
  if (status === "no_show") return "border-red-200 bg-red-50 text-red-700";
  if (status === "rejected" || status === "cancelled") return "border-slate-200 bg-slate-100 text-slate-600";
  return "border-slate-200 bg-white text-slate-600";
}

function datetimeLocal(value: string) {
  const date = new Date(value);
  const local = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  return local.toISOString().slice(0, 16);
}

function contactLine(appointment: {
  email: string;
  phone: string | null;
  line_id: string | null;
  whatsapp: string | null;
}) {
  return [
    appointment.email ? `Email: ${appointment.email}` : "",
    appointment.phone ? `Phone: ${appointment.phone}` : "",
    appointment.line_id ? `LINE: ${appointment.line_id}` : "",
    appointment.whatsapp ? `WhatsApp: ${appointment.whatsapp}` : "",
  ].filter(Boolean).join(" · ");
}

function dayKey(value: string) {
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function timeLabel(value: string) {
  return new Date(new Date(value).getTime() + 7 * 60 * 60 * 1000).toISOString().slice(11, 16);
}

export default async function AppointmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: StatusFilter; range?: RangeFilter; view?: ViewFilter; admin?: string; q?: string; error?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const status = statusValue(params.status);
  const range = rangeValue(params.range);
  const view = viewValue(params.view);
  const adminFilter = admin.role === "master_admin" && typeof params.admin === "string" ? params.admin : "";
  const adminFilterId = adminFilter || null;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const search = `%${q}%`;
  const sql = getSql();
  const adminRows = admin.role === "master_admin"
    ? (await sql`
        select id, name, username
        from admin_users
        where is_active = true
          and deleted_at is null
        order by role desc, name asc
      `) as { id: string; name: string; username: string }[]
    : [];
  const appointments = (await sql`
    select
      a.*,
      au.name as assigned_admin_name,
      au.username as assigned_admin_username,
      l.status as lead_status,
      c.summary,
      c.main_problem,
      c.recommended_service,
      c.interest_level
    from appointments a
    left join admin_users au on au.id = a.assigned_admin_id
    left join leads l on l.id = a.lead_id
    left join conversations c on c.id = a.conversation_id
    where a.deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or a.assigned_admin_id = ${admin.id}
      )
      and (${adminFilterId}::uuid is null or a.assigned_admin_id = ${adminFilterId}::uuid)
      and (${status} = 'all' or a.status = ${status})
      and (
        ${range} = 'all'
        or (${range} = 'today' and a.start_at >= date_trunc('day', now()) and a.start_at < date_trunc('day', now()) + interval '1 day')
        or (${range} = 'week' and a.start_at >= date_trunc('week', now()) and a.start_at < date_trunc('week', now()) + interval '1 week')
        or (${range} = 'month' and a.start_at >= date_trunc('month', now()) and a.start_at < date_trunc('month', now()) + interval '1 month')
        or (${range} = 'upcoming' and a.start_at >= now())
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
    limit 200
  `) as {
    id: string;
    lead_id: string | null;
    conversation_id: string | null;
    assigned_admin_id: string | null;
    assigned_admin_name_snapshot: string | null;
    assigned_admin_name: string | null;
    assigned_admin_username: string | null;
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
      ao.override_type,
      ao.starts_at,
      ao.ends_at,
      ao.reason,
      au.name as admin_name
    from availability_overrides ao
    left join admin_users au on au.id = ao.admin_user_id
    where ao.override_type = 'blocked'
      and (
        ${admin.role === "master_admin"}::boolean
        or ao.admin_user_id = ${admin.id}
      )
      and (${adminFilterId}::uuid is null or ao.admin_user_id = ${adminFilterId}::uuid)
      and (
        ${range} = 'all'
        or (${range} = 'today' and ao.starts_at < date_trunc('day', now()) + interval '1 day' and ao.ends_at >= date_trunc('day', now()))
        or (${range} = 'week' and ao.starts_at < date_trunc('week', now()) + interval '1 week' and ao.ends_at >= date_trunc('week', now()))
        or (${range} = 'month' and ao.starts_at < date_trunc('month', now()) + interval '1 month' and ao.ends_at >= date_trunc('month', now()))
        or (${range} = 'upcoming' and ao.ends_at >= now())
      )
    order by ao.starts_at asc
    limit 200
  `) as { id: string; override_type: string; starts_at: string; ends_at: string; reason: string | null; admin_name: string | null }[];
  const currentQuery = `status=${status}&range=${range}&view=${view}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const calendarDays = [...new Set([
    ...appointments.map((appointment) => dayKey(appointment.start_at)),
    ...blockedTimes.map((block) => dayKey(block.starts_at)),
  ])].sort();

  return (
    <AdminShell>
      {params.error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Appointment action failed: {params.error.replaceAll("_", " ")}.
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Appointments</h2>
          <p className="mt-1 text-sm text-slate-600">
            {admin.role === "master_admin" ? "Manage all team appointments." : "Manage your assigned appointments."}
          </p>
        </div>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <Link href="/admin/appointments/availability" className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
            Availability
          </Link>
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="status" value={status} />
            <input type="hidden" name="range" value={range} />
            <input type="hidden" name="view" value={view} />
            {admin.role === "master_admin" ? (
              <select name="admin" defaultValue={adminFilter} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm">
                <option value="">All admins</option>
                {adminRows.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            ) : null}
            <input name="q" defaultValue={q} placeholder="Search appointments" className="w-64 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm" />
            <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm">Search</button>
          </form>
        </div>
      </div>

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-4 xl:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {ranges.map((item) => (
                <Link
                  key={item.key}
                  href={`/admin/appointments?status=${status}&range=${item.key}&view=${view}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    item.key === range ? "border-cyan-300 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>

            <div className="flex flex-wrap gap-2">
              {statuses.map((item) => (
                <Link
                  key={item.key}
                  href={`/admin/appointments?status=${item.key}&range=${range}&view=${view}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`rounded-md border px-3 py-2 text-sm font-medium ${
                    item.key === status ? "border-cyan-300 bg-cyan-50 text-cyan-800" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:justify-end">
            {(["list", "calendar"] as ViewFilter[]).map((item) => (
              <Link
                key={item}
                href={`/admin/appointments?status=${status}&range=${range}&view=${item}${adminFilter ? `&admin=${adminFilter}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                  item === view ? "border-slate-900 bg-slate-950 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                {item === "list" ? "List" : "Calendar"}
              </Link>
            ))}
          </div>
        </div>
      </section>

      {view === "calendar" ? (
        <section className="mb-5 rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Calendar</div>
          {calendarDays.length ? (
            <div className="grid gap-px overflow-hidden rounded-b-xl bg-slate-200 md:grid-cols-2 xl:grid-cols-3">
              {calendarDays.map((date) => {
                const dayAppointments = appointments.filter((appointment) => dayKey(appointment.start_at) === date);
                const dayBlocks = blockedTimes.filter((block) => dayKey(block.starts_at) === date);

                return (
                  <div key={date} className="min-h-64 bg-white p-4">
                    <div className="mb-4 font-semibold text-slate-950">
                      {new Date(`${date}T00:00:00+07:00`).toLocaleDateString(undefined, {
                        weekday: "short",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="space-y-2">
                      {dayBlocks.map((block) => (
                        <div key={block.id} className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                          <div className="font-semibold">Blocked · {block.admin_name || "Admin"}</div>
                          <div>{timeLabel(block.starts_at)} - {timeLabel(block.ends_at)}</div>
                          {block.reason ? <div className="mt-1 text-slate-500">{block.reason}</div> : null}
                        </div>
                      ))}
                      {dayAppointments.map((appointment) => (
                        <div key={appointment.id} className={`rounded-md border px-3 py-2 text-xs ${statusClass(appointment.status)}`}>
                          <div className="font-semibold">{timeLabel(appointment.start_at)} · {appointment.client_name}</div>
                          <div className="mt-1">{appointment.assigned_admin_name || appointment.assigned_admin_name_snapshot || "Unassigned"}</div>
                          <div className="mt-1">{appointment.status.replaceAll("_", " ")}</div>
                        </div>
                      ))}
                      {!dayBlocks.length && !dayAppointments.length ? (
                        <div className="text-sm text-slate-500">No events.</div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="px-5 py-6 text-sm text-slate-500">No calendar items in this view.</div>
          )}
        </section>
      ) : null}

      {view === "list" ? <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Appointment list</div>
        <div className="divide-y divide-slate-100">
          {appointments.map((appointment) => (
            <div key={appointment.id} className="grid gap-5 px-5 py-5 text-sm xl:grid-cols-[1fr_380px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-slate-950">
                    {appointment.client_name}{appointment.company_name ? ` · ${appointment.company_name}` : ""}
                  </div>
                  <span className={`rounded-full border px-2 py-1 text-xs ${statusClass(appointment.status)}`}>
                    {appointment.status.replaceAll("_", " ")}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-600">
                    {appointment.source.replaceAll("_", " ")}
                  </span>
                </div>
                <div className="mt-2 text-slate-700">
                  {new Date(appointment.start_at).toLocaleString()} · {appointment.duration_minutes} min · {appointment.timezone}
                </div>
                <div className="mt-2 text-slate-600">{contactLine(appointment)}</div>
                <div className="mt-2 text-slate-500">
                  Assigned to {appointment.assigned_admin_name || appointment.assigned_admin_name_snapshot || "Unassigned"}
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-500 md:grid-cols-2">
                  <div>Problem: {appointment.main_problem || appointment.summary || "Not captured"}</div>
                  <div>Service: {appointment.recommended_service || "Not captured"}</div>
                  <div>Interest: {appointment.interest_level || "unknown"}</div>
                  <div>Lead status: {appointment.lead_status || "none"}</div>
                </div>
                {appointment.note || appointment.admin_notes ? (
                  <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                    {appointment.note ? `Client note: ${appointment.note}` : null}
                    {appointment.note && appointment.admin_notes ? <br /> : null}
                    {appointment.admin_notes ? `Admin note: ${appointment.admin_notes}` : null}
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  {appointment.conversation_id ? (
                    <Link href={`/admin/conversations/${appointment.conversation_id}`} className="font-semibold text-cyan-700">Conversation</Link>
                  ) : null}
                  {appointment.lead_id ? <Link href="/admin/leads" className="font-semibold text-cyan-700">Lead</Link> : null}
                </div>
              </div>

              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                <div className="flex flex-wrap gap-2">
                  {appointment.status === "pending_confirmation" ? (
                    <>
                      <form action={confirmAppointmentAction}>
                        <input type="hidden" name="id" value={appointment.id} />
                        <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                        <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
                          Confirm
                        </button>
                      </form>
                      <form action={rejectAppointmentAction}>
                        <input type="hidden" name="id" value={appointment.id} />
                        <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                        <ConfirmSubmitButton
                          message="Reject this appointment?"
                          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                        >
                          Reject
                        </ConfirmSubmitButton>
                      </form>
                    </>
                  ) : null}
                  {appointment.status === "confirmed" ? (
                    <>
                      <form action={markAppointmentCompletedAction}>
                        <input type="hidden" name="id" value={appointment.id} />
                        <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                        <button className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
                          Complete
                        </button>
                      </form>
                      <form action={markAppointmentNoShowAction}>
                        <input type="hidden" name="id" value={appointment.id} />
                        <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                        <button className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                          No-show
                        </button>
                      </form>
                    </>
                  ) : null}
                  {appointment.status === "pending_confirmation" || appointment.status === "confirmed" ? (
                    <form action={cancelAppointmentAction}>
                      <input type="hidden" name="id" value={appointment.id} />
                      <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                      <ConfirmSubmitButton
                        message="Cancel this appointment?"
                        className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                      >
                        Cancel
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>

                <form action={rescheduleAppointmentAction} className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
                  <input type="hidden" name="id" value={appointment.id} />
                  <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                  <input name="start_at" type="datetime-local" defaultValue={datetimeLocal(appointment.start_at)} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                  <input name="duration_minutes" type="number" min={10} max={240} defaultValue={appointment.duration_minutes} className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                  <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Reschedule</button>
                </form>

                {admin.role === "master_admin" ? (
                  <form action={reassignAppointmentAction} className="flex gap-2">
                    <input type="hidden" name="id" value={appointment.id} />
                    <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                    <select name="assigned_admin_id" defaultValue={appointment.assigned_admin_id || ""} className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800">
                      <option value="">Unassigned</option>
                      {adminRows.map((item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                      ))}
                    </select>
                    <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Reassign</button>
                  </form>
                ) : null}

                <form action={updateAppointmentNotesAction} className="grid gap-2">
                  <input type="hidden" name="id" value={appointment.id} />
                  <input type="hidden" name="redirect_to" value={`/admin/appointments?${currentQuery}`} />
                  <textarea name="admin_notes" rows={3} defaultValue={appointment.admin_notes || ""} placeholder="Appointment notes" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800" />
                  <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
                    Save notes
                  </button>
                </form>
              </div>
            </div>
          ))}
          {appointments.length === 0 ? <div className="px-5 py-6 text-sm text-slate-500">No appointments in this view.</div> : null}
        </div>
      </section> : null}
    </AdminShell>
  );
}
