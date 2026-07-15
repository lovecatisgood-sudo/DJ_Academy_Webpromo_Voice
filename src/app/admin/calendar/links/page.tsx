import Link from "next/link";
import { AdminShell } from "../../AdminShell";
import {
  createBookingLinkAction,
  deleteBookingLinkAction,
  setActiveAiBookingLinkAction,
  updateBookingLinkAction,
} from "../../actions";
import { ConfirmSubmitButton } from "../../ConfirmSubmitButton";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

const inputClass = "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm";
const labelClass = "block text-sm font-medium text-slate-700";

export default async function CalendarLinksPage({
  searchParams,
}: {
  searchParams: Promise<{ created?: string; updated?: string; deleted?: string; active?: string; error?: string }>;
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
  const links = (await sql`
    select
      bl.*,
      au.name as owner_name,
      au.username as owner_username,
      coalesce(acp.is_active, false) as calendar_active,
      count(a.id) filter (
        where a.deleted_at is null
          and a.start_at >= now()
          and a.status in ('pending_confirmation', 'confirmed')
      )::int as upcoming_appointments
    from booking_links bl
    join admin_users au on au.id = bl.owner_admin_id
    left join admin_calendar_profiles acp on acp.admin_user_id = bl.owner_admin_id
    left join appointments a on a.booking_link_id = bl.id
    where bl.deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or bl.owner_admin_id = ${admin.id}
      )
    group by bl.id, au.name, au.username, acp.is_active
    order by bl.is_ai_active desc, bl.created_at desc
  `) as {
    id: string;
    owner_admin_id: string;
    name: string;
    slug: string;
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
    owner_username: string;
    calendar_active: boolean;
    upcoming_appointments: number;
  }[];

  return (
    <AdminShell>
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Booking links</h2>
          <p className="mt-1 text-sm text-slate-600">
            Create consultation links with duration and booking rules. Master admin chooses which one the AI voice agent uses.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/calendar" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Calendar
          </Link>
          <Link href="/admin/calendar/availability" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
            Availability
          </Link>
        </div>
      </div>

      {params.error ? (
        <div className="mb-5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Booking link action failed: {params.error.replaceAll("_", " ")}.
        </div>
      ) : null}
      {params.created || params.updated || params.deleted || params.active ? (
        <div className="mb-5 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Booking links updated.
        </div>
      ) : null}

      <section className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-950">Create booking link</h3>
        <form action={createBookingLinkAction} className="mt-4 grid gap-4 xl:grid-cols-4">
          <input type="hidden" name="redirect_to" value="/admin/calendar/links" />
          {admin.role === "master_admin" ? (
            <label className={labelClass}>
              Owner admin
              <select name="owner_admin_id" defaultValue={admin.id} className={inputClass}>
                {adminRows.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.username})</option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={labelClass}>
            Link name
            <input name="name" defaultValue="Free Consultation" className={inputClass} required />
          </label>
          <label className={labelClass}>
            Public slug
            <input name="slug" defaultValue="free-consultation" className={inputClass} required />
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
          <label className={`${labelClass} xl:col-span-2`}>
            Meeting title
            <input name="title" defaultValue="DJAI Free Consultation" className={inputClass} required />
          </label>
          <label className={`${labelClass} xl:col-span-2`}>
            Meeting location/link
            <input name="meeting_location" placeholder="Google Meet, Zoom, phone call, or office location" className={inputClass} />
          </label>
          <label className={`${labelClass} xl:col-span-4`}>
            Description
            <textarea name="description" rows={2} className={inputClass} placeholder="Short customer-facing note for this booking link." />
          </label>
          <div className="grid gap-4 xl:col-span-4 md:grid-cols-5">
            <label className={labelClass}>
              Min notice
              <input name="minimum_notice_minutes" type="number" min={0} max={10080} defaultValue={240} className={inputClass} />
            </label>
            <label className={labelClass}>
              Booking window
              <input name="booking_window_days" type="number" min={1} max={365} defaultValue={30} className={inputClass} />
            </label>
            <label className={labelClass}>
              Buffer before
              <input name="buffer_before_minutes" type="number" min={0} max={120} defaultValue={0} className={inputClass} />
            </label>
            <label className={labelClass}>
              Buffer after
              <input name="buffer_after_minutes" type="number" min={0} max={120} defaultValue={0} className={inputClass} />
            </label>
            <label className={labelClass}>
              Max/day
              <input name="max_bookings_per_day" type="number" min={1} max={50} className={inputClass} />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 xl:col-span-4">
            <input type="hidden" name="require_confirmation" value="off" />
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input name="require_confirmation" type="checkbox" defaultChecked />
              Require admin confirmation
            </label>
            {admin.role === "master_admin" ? (
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <input name="set_ai_active" type="checkbox" />
                Set as AI booking link
              </label>
            ) : null}
            <button className="ml-auto rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">
              Create link
            </button>
          </div>
        </form>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Existing booking links</div>
        <div className="divide-y divide-slate-100">
          {links.map((link) => (
            <div key={link.id} className="grid gap-5 px-5 py-5 text-sm xl:grid-cols-[1fr_420px]">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-slate-950">{link.name}</div>
                  {link.is_ai_active ? <span className="rounded-full bg-cyan-100 px-2 py-1 text-xs font-semibold text-cyan-800">AI active</span> : null}
                  <span className={`rounded-full px-2 py-1 text-xs font-semibold ${link.is_active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
                    {link.is_active ? "Active" : "Inactive"}
                  </span>
                  {!link.calendar_active ? <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-semibold text-amber-800">Calendar inactive</span> : null}
                </div>
                <div className="mt-2 text-slate-600">
                  /book/{link.slug} · {link.duration_minutes} min · {link.owner_name} ({link.owner_username})
                </div>
                <div className="mt-2 text-slate-500">
                  {link.title}{link.meeting_location ? ` · ${link.meeting_location}` : ""}
                </div>
                <div className="mt-2 text-xs text-slate-500">
                  Notice {link.minimum_notice_minutes} min · Window {link.booking_window_days} days · Buffer {link.buffer_before_minutes}/{link.buffer_after_minutes} min · Upcoming {link.upcoming_appointments}
                </div>
                <div className="mt-3 flex flex-wrap gap-3 text-xs">
                  <Link href={`/book/${link.slug}`} className="font-semibold text-cyan-700">Open public page</Link>
                  <Link href={`/admin/calendar/availability?admin=${link.owner_admin_id}&link=${link.id}`} className="font-semibold text-cyan-700">Preview availability</Link>
                </div>
              </div>
              <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {admin.role === "master_admin" ? (
                  <form action={setActiveAiBookingLinkAction}>
                    <input type="hidden" name="redirect_to" value="/admin/calendar/links" />
                    <input type="hidden" name="booking_link_id" value={link.id} />
                    <button className="w-full rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
                      {link.is_ai_active ? "AI booking link selected" : "Set as AI booking link"}
                    </button>
                  </form>
                ) : null}
                <form action={updateBookingLinkAction} className="grid gap-3">
                  <input type="hidden" name="redirect_to" value="/admin/calendar/links" />
                  <input type="hidden" name="id" value={link.id} />
                  <div className="grid gap-2 sm:grid-cols-2">
                    <input name="name" defaultValue={link.name} className={inputClass} aria-label="Link name" />
                    <input name="slug" defaultValue={link.slug} className={inputClass} aria-label="Slug" />
                    <input name="title" defaultValue={link.title} className={inputClass} aria-label="Title" />
                    <input name="meeting_location" defaultValue={link.meeting_location || ""} className={inputClass} aria-label="Meeting location" />
                    <input name="duration_minutes" type="number" min={10} max={240} defaultValue={link.duration_minutes} className={inputClass} aria-label="Duration minutes" />
                    <input name="minimum_notice_minutes" type="number" min={0} max={10080} defaultValue={link.minimum_notice_minutes} className={inputClass} aria-label="Minimum notice" />
                    <input name="booking_window_days" type="number" min={1} max={365} defaultValue={link.booking_window_days} className={inputClass} aria-label="Booking window" />
                    <input name="max_bookings_per_day" type="number" min={1} max={50} defaultValue={link.max_bookings_per_day || ""} className={inputClass} aria-label="Max bookings per day" />
                    <input name="buffer_before_minutes" type="number" min={0} max={120} defaultValue={link.buffer_before_minutes} className={inputClass} aria-label="Buffer before" />
                    <input name="buffer_after_minutes" type="number" min={0} max={120} defaultValue={link.buffer_after_minutes} className={inputClass} aria-label="Buffer after" />
                  </div>
                  <textarea name="description" rows={2} defaultValue={link.description || ""} className={inputClass} aria-label="Description" />
                  <div className="flex flex-wrap items-center gap-4">
                    <input type="hidden" name="require_confirmation" value="off" />
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input name="is_active" type="checkbox" defaultChecked={link.is_active} />
                      Active
                    </label>
                    <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
                      <input name="require_confirmation" type="checkbox" defaultChecked={link.require_confirmation} />
                      Require confirmation
                    </label>
                    <button className="ml-auto rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                      Save
                    </button>
                  </div>
                </form>
                <form action={deleteBookingLinkAction}>
                  <input type="hidden" name="redirect_to" value="/admin/calendar/links" />
                  <input type="hidden" name="id" value={link.id} />
                  <ConfirmSubmitButton
                    message="Delete this booking link? Historical appointments stay linked."
                    className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                  >
                    Delete link
                  </ConfirmSubmitButton>
                </form>
              </div>
            </div>
          ))}
          {links.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No booking links yet. Create the first consultation link above.</div> : null}
        </div>
      </section>
    </AdminShell>
  );
}
