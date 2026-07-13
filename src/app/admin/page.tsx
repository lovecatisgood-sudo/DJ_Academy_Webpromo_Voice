import Link from "next/link";
import { AdminShell } from "./AdminShell";
import { DetailSection } from "./components/DetailSection";
import { InterestPill } from "./components/InterestPill";
import { MetricCard } from "./components/MetricCard";
import { QueueItem } from "./components/QueueItem";
import { StatusPill } from "./components/StatusPill";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

type Period = "today" | "7d" | "30d";

function periodSql(period: Period) {
  if (period === "today") return "1 day";
  if (period === "7d") return "7 days";
  return "30 days";
}

function contactLine(lead: {
  phone: string | null;
  email: string | null;
  line_id: string | null;
  whatsapp: string | null;
  other_contact: string | null;
}) {
  return [lead.phone, lead.email, lead.line_id, lead.whatsapp, lead.other_contact].filter(Boolean).join(" · ") || "No contact captured";
}

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const period = params.period === "today" || params.period === "7d" || params.period === "30d" ? params.period : "7d";
  const sql = getSql();
  const interval = periodSql(period);
  const [stats] = (await sql`
    select
      count(*)::text as conversations,
      count(*) filter (where had_lead)::text as leads,
      count(*) filter (where exists (
        select 1 from leads
        where leads.conversation_id = conversations.id
          and leads.status = 'pending_follow_up'
      ))::text as pending_follow_up,
      count(*) filter (where interest_level = 'high')::text as high_interest,
      count(*) filter (where exists (
        select 1 from leads
        where leads.conversation_id = conversations.id
          and leads.status = 'appointment_set'
      ))::text as appointment_set,
      (select count(*)::text from appointments
        where status = 'pending_confirmation'
          and deleted_at is null
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
      ) as pending_appointments,
      (select count(*)::text from appointments
        where start_at >= date_trunc('day', now())
          and start_at < date_trunc('day', now()) + interval '1 day'
          and deleted_at is null
          and status in ('pending_confirmation', 'confirmed')
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
      ) as appointments_today,
      round(avg(duration_seconds)) as avg_duration,
      case when count(*) = 0 then 0 else round((count(*) filter (where had_lead)::numeric / count(*)::numeric) * 100) end as capture_rate
    from conversations
    where started_at >= now() - ${interval}::interval
      and deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
        or exists (
          select 1 from leads
          where leads.conversation_id = conversations.id
            and leads.assigned_admin_id = ${admin.id}
        )
      )
  `) as
    {
      conversations: string;
      leads: string;
      pending_follow_up: string;
      high_interest: string;
      appointment_set: string;
      pending_appointments: string;
      appointments_today: string;
      avg_duration: number | null;
      capture_rate: number | null;
    }[];
  const pendingLeads = (await sql`
    select
      leads.id,
      leads.conversation_id,
      leads.client_name,
      leads.company_name,
      leads.phone,
      leads.email,
      leads.line_id,
      leads.whatsapp,
      leads.other_contact,
      conversations.interest_level,
      conversations.main_problem,
      conversations.next_action
    from leads
    left join conversations on conversations.id = leads.conversation_id
    where leads.status = 'pending_follow_up'
      and (conversations.deleted_at is null or conversations.id is null)
      and (
        ${admin.role === "master_admin"}::boolean
        or leads.assigned_admin_id = ${admin.id}
      )
    order by leads.updated_at desc nulls last, leads.created_at desc
    limit 8
  `) as
    {
      id: string;
      conversation_id: string | null;
      client_name: string | null;
      company_name: string | null;
      phone: string | null;
      email: string | null;
      line_id: string | null;
      whatsapp: string | null;
      other_contact: string | null;
      interest_level: string | null;
      main_problem: string | null;
      next_action: string | null;
    }[];
  const pendingAppointments = (await sql`
    select
      a.id,
      a.client_name,
      a.company_name,
      a.email,
      a.phone,
      a.start_at,
      au.name as admin_name
    from appointments a
    left join admin_users au on au.id = a.assigned_admin_id
    where a.status = 'pending_confirmation'
      and a.deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or a.assigned_admin_id = ${admin.id}
      )
    order by a.start_at asc
    limit 8
  `) as
    {
      id: string;
      client_name: string;
      company_name: string | null;
      email: string;
      phone: string | null;
      start_at: string;
      admin_name: string | null;
    }[];
  const [bookingState] = (await sql`
    select
      settings.booking_enabled,
      settings.active_booking_admin_id,
      admin_users.name as active_admin_name,
      count(availability_rules.id)::int as availability_rule_count
    from settings
    left join admin_users on admin_users.id = settings.active_booking_admin_id
    left join availability_rules
      on availability_rules.admin_user_id = settings.active_booking_admin_id
      and availability_rules.is_active = true
    where settings.id = 1
    group by settings.booking_enabled, settings.active_booking_admin_id, admin_users.name
    limit 1
  `) as
    {
      booking_enabled: boolean;
      active_booking_admin_id: string | null;
      active_admin_name: string | null;
      availability_rule_count: number;
    }[];
  const recent = (await sql`
    select id, started_at, duration_seconds, language, had_lead, page_url, summary, main_problem
    from conversations
    where deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
        or exists (
          select 1 from leads
          where leads.conversation_id = conversations.id
            and leads.assigned_admin_id = ${admin.id}
        )
      )
    order by started_at desc
    limit 8
  `) as
    {
      id: string;
      started_at: string;
      duration_seconds: number | null;
      language: string | null;
      had_lead: boolean;
      page_url: string | null;
      summary: string | null;
      main_problem: string | null;
    }[];

  return (
    <AdminShell>
      {admin.role === "master_admin" && bookingState?.booking_enabled && !bookingState.active_booking_admin_id ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          Booking is enabled but no active booking admin is selected.
        </div>
      ) : null}
      {admin.role === "master_admin" && bookingState?.booking_enabled && bookingState.active_booking_admin_id && bookingState.availability_rule_count === 0 ? (
        <div className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
          {bookingState.active_admin_name || "The active booking admin"} has no weekly availability configured.
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Overview</h2>
          <p className="mt-1 text-sm text-slate-600">
            Daily sales command center for calls, leads, appointments, and follow-up work.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["today", "7d", "30d"] as Period[]).map((item) => (
            <Link
              key={item}
              href={`/admin?period=${item}`}
              className={`rounded-md border px-3 py-2 text-sm font-semibold ${
                item === period ? "border-[#0e7c86] bg-[#0e7c86] text-white" : "border-slate-200 bg-white text-slate-700 hover:border-cyan-300"
              }`}
            >
              {item}
            </Link>
          ))}
        </div>
      </div>

      <section className="mb-5 grid gap-4 lg:grid-cols-3">
        <Link href="/admin/leads?status=pending_follow_up" className="rounded-xl border border-amber-200 bg-white p-4 shadow-sm transition hover:border-amber-300">
          <div className="text-sm font-semibold text-slate-700">Pending follow-up</div>
          <div className="mt-2 text-3xl font-semibold text-amber-700">{stats?.pending_follow_up ?? "0"}</div>
          <div className="mt-1 text-sm text-slate-500">Leads waiting for admin action</div>
        </Link>
        <Link href="/admin/appointments?status=pending_confirmation&range=upcoming" className="rounded-xl border border-cyan-200 bg-white p-4 shadow-sm transition hover:border-cyan-300">
          <div className="text-sm font-semibold text-slate-700">Pending confirmations</div>
          <div className="mt-2 text-3xl font-semibold text-cyan-700">{stats?.pending_appointments ?? "0"}</div>
          <div className="mt-1 text-sm text-slate-500">Appointments that need confirm or reject</div>
        </Link>
        <Link href="/admin/conversations?filter=failed" className="rounded-xl border border-red-200 bg-white p-4 shadow-sm transition hover:border-red-300">
          <div className="text-sm font-semibold text-slate-700">Analysis review</div>
          <div className="mt-2 text-3xl font-semibold text-red-700">Check</div>
          <div className="mt-1 text-sm text-slate-500">Open failed or pending post-call analysis</div>
        </Link>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4 2xl:grid-cols-8">
        <MetricCard label="Conversations" value={stats?.conversations ?? "0"} />
        <MetricCard label="Leads captured" value={stats?.leads ?? "0"} tone="cyan" />
        <MetricCard label="Capture rate" value={`${stats?.capture_rate ?? 0}%`} />
        <MetricCard label="High interest" value={stats?.high_interest ?? "0"} tone="red" />
        <MetricCard label="Pending follow-up" value={stats?.pending_follow_up ?? "0"} tone="amber" />
        <MetricCard label="Appointment set" value={stats?.appointment_set ?? "0"} tone="emerald" />
        <MetricCard label="Appts today" value={stats?.appointments_today ?? "0"} />
        <MetricCard label="Avg duration" value={`${stats?.avg_duration ?? 0}s`} />
      </section>

      <div className="mt-6 grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <DetailSection
          title="Action queue"
          action={<Link href="/admin/inbox" className="text-sm font-semibold text-cyan-700">Open Inbox</Link>}
        >
          <div className="grid gap-3">
            {pendingAppointments.map((appointment) => (
              <QueueItem
                key={appointment.id}
                href="/admin/appointments?status=pending_confirmation&range=upcoming"
                status="pending_confirmation"
                title={`${appointment.client_name}${appointment.company_name ? ` · ${appointment.company_name}` : ""}`}
                subtitle={`Requested ${new Date(appointment.start_at).toLocaleString()}`}
                meta={[appointment.email, appointment.phone, appointment.admin_name].filter(Boolean).join(" · ")}
                actionLabel="Review"
              />
            ))}
            {pendingLeads.map((lead) => (
              <QueueItem
                key={lead.id}
                href={lead.conversation_id ? `/admin/conversations/${lead.conversation_id}` : "/admin/leads"}
                status="pending_follow_up"
                title={lead.client_name || lead.company_name || "Unnamed lead"}
                subtitle={lead.main_problem || "No problem summary yet."}
                meta={`${contactLine(lead)} · ${lead.next_action || "No next action"}`}
                actionLabel="Follow up"
              />
            ))}
            {pendingAppointments.length === 0 && pendingLeads.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 px-4 py-8 text-center text-sm text-slate-500">
                No pending follow-up or appointment confirmations.
              </div>
            ) : null}
          </div>
        </DetailSection>

        <DetailSection title="Exports and operations">
          <div className="grid gap-2">
            <a href="/api/admin/export/leads.csv" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-300">
              Export leads
            </a>
            <a href="/api/admin/export/conversations.csv" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-300">
              Export conversations
            </a>
            <a href="/api/admin/export/appointments.csv" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-cyan-300">
              Export appointments
            </a>
          </div>
          <div className="mt-5 rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
            <div className="font-semibold text-slate-800">Booking calendar</div>
            <div className="mt-1">
              {bookingState?.booking_enabled
                ? `Enabled${bookingState.active_admin_name ? ` for ${bookingState.active_admin_name}` : ""}`
                : "Disabled"}
            </div>
          </div>
        </DetailSection>
      </div>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        <DetailSection title="Needs follow-up">
          <div className="divide-y divide-slate-100">
            {pendingLeads.map((lead) => (
              <Link
                key={lead.id}
                href={lead.conversation_id ? `/admin/conversations/${lead.conversation_id}` : "/admin/leads"}
                className="block py-4 text-sm first:pt-0 last:pb-0"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="font-semibold text-slate-950">
                    {lead.client_name || lead.company_name || "Unnamed lead"}
                  </div>
                  <InterestPill value={lead.interest_level} />
                </div>
                <div className="mt-1 text-slate-600">{contactLine(lead)}</div>
                <div className="mt-2 text-slate-700">{lead.main_problem || "No problem summary yet."}</div>
                <div className="mt-2 text-xs text-slate-500">{lead.next_action || "No next action captured"}</div>
              </Link>
            ))}
            {pendingLeads.length === 0 ? <div className="py-6 text-sm text-slate-500">No pending follow-up leads.</div> : null}
          </div>
        </DetailSection>

        <DetailSection title="Recent conversations">
          <div className="divide-y divide-slate-100">
            {recent.map((conversation) => (
              <Link
                key={conversation.id}
                href={`/admin/conversations/${conversation.id}`}
                className="grid gap-2 py-4 text-sm first:pt-0 last:pb-0 sm:grid-cols-[1fr_auto]"
              >
                <div className="min-w-0">
                  <div className="truncate font-semibold text-slate-950">
                    {conversation.summary || conversation.main_problem || conversation.page_url || conversation.id}
                  </div>
                  <div className="mt-1 text-slate-500">
                    {conversation.language || "unknown"} · {conversation.duration_seconds ?? 0}s · {conversation.page_url || "unknown page"}
                  </div>
                </div>
                <div className="flex items-start justify-end">
                  {conversation.had_lead ? <StatusPill tone="cyan">Lead</StatusPill> : <StatusPill tone="slate">No lead</StatusPill>}
                </div>
              </Link>
            ))}
            {recent.length === 0 ? <div className="py-6 text-sm text-slate-500">No conversations yet.</div> : null}
          </div>
        </DetailSection>
      </div>
    </AdminShell>
  );
}
