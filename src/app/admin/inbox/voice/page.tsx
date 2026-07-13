import Link from "next/link";
import { AdminShell } from "../../AdminShell";
import { ConfirmSubmitButton } from "../../ConfirmSubmitButton";
import {
  deleteConversationAction,
  regenerateConversationAnalysisAction,
  toggleConversationStarAction,
  updateConversationIntelligenceAction,
  updateLeadAction,
} from "../../actions";
import { InterestPill } from "../../components/InterestPill";
import { StatusPill } from "../../components/StatusPill";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { TranscriptItem } from "@/lib/types";

export const dynamic = "force-dynamic";

type InboxFilter =
  | "all"
  | "leads"
  | "no_leads"
  | "high_interest"
  | "pending_follow_up"
  | "appointment_set"
  | "starred"
  | "failed";

const filters: { key: InboxFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "leads", label: "Leads" },
  { key: "no_leads", label: "No lead" },
  { key: "high_interest", label: "High interest" },
  { key: "pending_follow_up", label: "Pending" },
  { key: "appointment_set", label: "Appointment" },
  { key: "starred", label: "Starred" },
  { key: "failed", label: "Failed analysis" },
];

const leadStatuses = [
  ["pending_follow_up", "Pending follow up"],
  ["appointment_set", "Appointment set"],
  ["follow_up_later", "Follow up later"],
  ["deal_closed", "Deal closed"],
  ["no_deal", "No deal"],
];

const inputClass = "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";

function filterValue(value: unknown): InboxFilter {
  return value === "leads" ||
    value === "no_leads" ||
    value === "high_interest" ||
    value === "pending_follow_up" ||
    value === "appointment_set" ||
    value === "starred" ||
    value === "failed"
    ? value
    : "all";
}

function selectedHref(id: string, filter: InboxFilter, q: string) {
  return `/admin/inbox/voice?id=${id}&filter=${filter}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}

function contactLine(lead: {
  phone: string | null;
  email: string | null;
  line_id: string | null;
  whatsapp: string | null;
  other_contact: string | null;
  contact?: string | null;
}) {
  return [
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    lead.line_id ? `LINE: ${lead.line_id}` : "",
    lead.whatsapp ? `WhatsApp: ${lead.whatsapp}` : "",
    lead.other_contact ? `Other: ${lead.other_contact}` : "",
  ].filter(Boolean).join(" · ") || lead.contact || "No contact";
}

function bubbleClass(role: TranscriptItem["role"]) {
  if (role === "assistant") return "ml-auto bg-cyan-50 text-slate-900";
  if (role === "tool") return "mx-auto max-w-2xl border border-cyan-200 bg-white text-cyan-800";
  if (role === "system") return "mx-auto max-w-2xl border border-slate-200 bg-white text-slate-500";
  return "mr-auto bg-white text-slate-900";
}

export default async function VoiceInboxPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; filter?: InboxFilter; q?: string; analysis?: string; deleted?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const filter = filterValue(params.filter);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const search = `%${q}%`;
  const sql = getSql();

  const conversations = (await sql`
    select
      c.id,
      c.started_at,
      c.duration_seconds,
      c.language,
      c.page_url,
      c.had_lead,
      c.starred,
      c.summary,
      c.main_problem,
      c.recommended_service,
      c.next_action,
      c.interest_level,
      c.analysis_status,
      lead.client_name as lead_client_name,
      lead.company_name as lead_company_name,
      lead.status as lead_status,
      appointment.status as appointment_status,
      appointment.start_at as appointment_start_at
    from conversations c
    left join lateral (
      select client_name, company_name, status
      from leads
      where leads.conversation_id = c.id
      order by leads.updated_at desc nulls last, leads.created_at desc
      limit 1
    ) lead on true
    left join lateral (
      select status, start_at
      from appointments
      where appointments.conversation_id = c.id
        and appointments.deleted_at is null
      order by appointments.start_at desc
      limit 1
    ) appointment on true
    where c.deleted_at is null
      and (
        ${admin.role === "master_admin"}::boolean
        or c.assigned_admin_id = ${admin.id}
        or exists (
          select 1 from leads
          where leads.conversation_id = c.id
            and leads.assigned_admin_id = ${admin.id}
        )
      )
      and (
        ${filter} = 'all'
        or (${filter} = 'leads' and c.had_lead)
        or (${filter} = 'no_leads' and not c.had_lead)
        or (${filter} = 'high_interest' and c.interest_level = 'high')
        or (${filter} = 'pending_follow_up' and lead.status = 'pending_follow_up')
        or (${filter} = 'appointment_set' and (lead.status = 'appointment_set' or appointment.status is not null))
        or (${filter} = 'starred' and c.starred)
        or (${filter} = 'failed' and c.analysis_status = 'failed')
      )
      and (
        ${q} = ''
        or coalesce(c.page_url, '') ilike ${search}
        or coalesce(c.summary, '') ilike ${search}
        or coalesce(c.main_problem, '') ilike ${search}
        or coalesce(c.recommended_service, '') ilike ${search}
        or coalesce(lead.client_name, '') ilike ${search}
        or coalesce(lead.company_name, '') ilike ${search}
      )
    order by c.started_at desc
    limit 100
  `) as {
    id: string;
    started_at: string;
    duration_seconds: number | null;
    language: string | null;
    page_url: string | null;
    had_lead: boolean;
    starred: boolean;
    summary: string | null;
    main_problem: string | null;
    recommended_service: string | null;
    next_action: string | null;
    interest_level: string | null;
    analysis_status: string | null;
    lead_client_name: string | null;
    lead_company_name: string | null;
    lead_status: string | null;
    appointment_status: string | null;
    appointment_start_at: string | null;
  }[];

  const selectedId = params.id || conversations[0]?.id || "";
  const [conversation] = selectedId
    ? (await sql`
        select *
        from conversations c
        where c.id = ${selectedId}
          and c.deleted_at is null
          and (
            ${admin.role === "master_admin"}::boolean
            or c.assigned_admin_id = ${admin.id}
            or exists (
              select 1 from leads
              where leads.conversation_id = c.id
                and leads.assigned_admin_id = ${admin.id}
            )
          )
        limit 1
      `) as {
        id: string;
        started_at: string;
        duration_seconds: number | null;
        language: string | null;
        page_url: string | null;
        transcript: TranscriptItem[] | null;
        had_lead: boolean;
        summary: string | null;
        business_type: string | null;
        main_problem: string | null;
        business_goal: string | null;
        interest_level: string | null;
        concern_or_objection: string | null;
        recommended_service: string | null;
        next_action: string | null;
        analysis_status: string | null;
        analysis_error: string | null;
        analysis_model_id: string | null;
        analysis_updated_at: string | null;
        starred: boolean;
      }[]
    : [];

  const leads = conversation
    ? (await sql`
        select *
        from leads
        where conversation_id = ${conversation.id}
          and (
            ${admin.role === "master_admin"}::boolean
            or assigned_admin_id = ${admin.id}
          )
        order by created_at desc
      `) as {
        id: string;
        name: string | null;
        contact: string | null;
        contact_type: string | null;
        need: string | null;
        preferred_time: string | null;
        status: string;
        client_name: string | null;
        company_name: string | null;
        phone: string | null;
        email: string | null;
        line_id: string | null;
        whatsapp: string | null;
        other_contact: string | null;
        preferred_contact_method: string | null;
        preferred_meeting_day: string | null;
        preferred_meeting_time: string | null;
        admin_notes: string | null;
      }[]
    : [];
  const lead = leads[0];

  const appointments = conversation
    ? (await sql`
        select
          a.id,
          a.status,
          a.start_at,
          a.end_at,
          a.client_name,
          a.email,
          a.phone,
          au.name as assigned_admin_name
        from appointments a
        left join admin_users au on au.id = a.assigned_admin_id
        where a.conversation_id = ${conversation.id}
          and a.deleted_at is null
          and (
            ${admin.role === "master_admin"}::boolean
            or a.assigned_admin_id = ${admin.id}
          )
        order by a.start_at desc
      `) as {
        id: string;
        status: string;
        start_at: string;
        end_at: string;
        client_name: string;
        email: string;
        phone: string | null;
        assigned_admin_name: string | null;
      }[]
    : [];

  return (
    <AdminShell>
      {params.analysis ? (
        <div className="mb-5 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-medium text-cyan-900">
          Conversation analysis refreshed.
        </div>
      ) : null}
      {params.deleted ? (
        <div className="mb-5 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-900">
          Conversation deleted.
        </div>
      ) : null}

      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Website Voice Widget</h2>
          <p className="mt-1 text-sm text-slate-600">
            Voice conversations in a channel workspace with lead, appointment, and customer context.
          </p>
        </div>
        <Link href="/admin/inbox" className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
          All channels
        </Link>
      </div>

      <div className="grid min-h-[760px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm xl:grid-cols-[330px_minmax(0,1fr)_360px]">
        <aside className="border-b border-slate-200 bg-slate-50 xl:border-b-0 xl:border-r">
          <div className="border-b border-slate-200 p-4">
            <form className="grid gap-2">
              <input type="hidden" name="filter" value={filter} />
              <input
                name="q"
                defaultValue={q}
                placeholder="Search conversations"
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm text-slate-900"
              />
            </form>
            <div className="mt-3 flex flex-wrap gap-2">
              {filters.map((item) => (
                <Link
                  key={item.key}
                  href={`/admin/inbox/voice?filter=${item.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                    item.key === filter ? "border-[#0e7c86] bg-[#0e7c86] text-white" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          <div className="max-h-[660px] overflow-auto">
            {conversations.map((item) => (
              <Link
                key={item.id}
                href={selectedHref(item.id, filter, q)}
                className={`block border-b border-slate-200 px-4 py-4 text-sm ${
                  conversation?.id === item.id ? "bg-cyan-50" : "bg-white hover:bg-slate-50"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                    {(item.lead_client_name || item.lead_company_name || "V").slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <div className="truncate font-semibold text-slate-950">
                        {item.lead_client_name || item.lead_company_name || item.summary || item.main_problem || "Visitor"}
                      </div>
                      {item.starred ? <span className="text-amber-500">Star</span> : null}
                    </div>
                    <div className="mt-1 line-clamp-2 text-slate-600">{item.main_problem || item.summary || item.page_url || item.id}</div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {item.had_lead ? <StatusPill tone="cyan">Lead</StatusPill> : <StatusPill tone="slate">No lead</StatusPill>}
                      {item.lead_status ? <StatusPill status={item.lead_status} /> : null}
                      {item.appointment_status ? <StatusPill status={item.appointment_status} /> : null}
                    </div>
                    <div className="mt-2 text-xs text-slate-500">
                      {new Date(item.started_at).toLocaleString()} · {item.language || "unknown"} · {item.duration_seconds ?? 0}s
                    </div>
                  </div>
                </div>
              </Link>
            ))}
            {conversations.length === 0 ? <div className="p-6 text-sm text-slate-500">No conversations in this view.</div> : null}
          </div>
        </aside>

        <section className="min-w-0 bg-[#f5f8fa]">
          {conversation ? (
            <>
              <div className="border-b border-slate-200 bg-white px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-semibold text-slate-950">
                        {lead?.client_name || lead?.company_name || conversation.summary || "Voice conversation"}
                      </h3>
                      <InterestPill value={conversation.interest_level} />
                      <StatusPill status={conversation.analysis_status} />
                    </div>
                    <div className="mt-1 text-sm text-slate-500">
                      {new Date(conversation.started_at).toLocaleString()} · {conversation.language || "unknown"} · {conversation.duration_seconds ?? 0}s · {conversation.page_url || "unknown page"}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <form action={toggleConversationStarAction}>
                      <input type="hidden" name="id" value={conversation.id} />
                      <input type="hidden" name="redirect_to" value={selectedHref(conversation.id, filter, q)} />
                      <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                        {conversation.starred ? "Unstar" : "Star"}
                      </button>
                    </form>
                    <form action={regenerateConversationAnalysisAction}>
                      <input type="hidden" name="id" value={conversation.id} />
                      <input type="hidden" name="redirect_to" value={`${selectedHref(conversation.id, filter, q)}&analysis=updated`} />
                      <button className="rounded-md border border-cyan-200 bg-cyan-50 px-3 py-2 text-sm font-semibold text-cyan-800">
                        Reanalyse
                      </button>
                    </form>
                  </div>
                </div>
              </div>

              <div className="max-h-[690px] overflow-auto p-5">
                <form action={updateConversationIntelligenceAction} className="mb-5 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                  <input type="hidden" name="id" value={conversation.id} />
                  <input type="hidden" name="redirect_to" value={selectedHref(conversation.id, filter, q)} />
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">Conversation intelligence</h4>
                    <span className="text-xs text-slate-500">
                      {conversation.analysis_model_id || "no model"} · {conversation.analysis_updated_at ? new Date(conversation.analysis_updated_at).toLocaleString() : "not analysed"}
                    </span>
                  </div>
                  {conversation.analysis_error ? (
                    <div className="mb-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                      {conversation.analysis_error}
                    </div>
                  ) : null}
                  <label className="block text-sm font-medium text-slate-700">
                    Summary
                    <textarea name="summary" rows={3} defaultValue={conversation.summary || ""} className={inputClass} />
                  </label>
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    <label className="block text-sm font-medium text-slate-700">
                      Business type
                      <input name="business_type" defaultValue={conversation.business_type || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Business goal
                      <input name="business_goal" defaultValue={conversation.business_goal || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Interest level
                      <select name="interest_level" defaultValue={conversation.interest_level || "unknown"} className={inputClass}>
                        <option value="unknown">Unknown</option>
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Recommended service
                      <input name="recommended_service" defaultValue={conversation.recommended_service || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Main problem
                      <textarea name="main_problem" rows={2} defaultValue={conversation.main_problem || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Concern or objection
                      <textarea name="concern_or_objection" rows={2} defaultValue={conversation.concern_or_objection || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700 md:col-span-2">
                      Next action
                      <input name="next_action" defaultValue={conversation.next_action || ""} className={inputClass} />
                    </label>
                  </div>
                  <button className="mt-4 rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Save analysis</button>
                </form>

                <div className="space-y-3">
                  {(conversation.transcript || []).map((item, index) => (
                    <div
                      key={`${item.t}-${index}`}
                      className={`max-w-[78%] rounded-2xl px-4 py-3 text-sm shadow-sm ${bubbleClass(item.role)}`}
                    >
                      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.role}</div>
                      <div className="whitespace-pre-wrap leading-6">{item.text}</div>
                    </div>
                  ))}
                  {!(conversation.transcript || []).length ? (
                    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-500">
                      No transcript saved.
                    </div>
                  ) : null}
                </div>
              </div>
            </>
          ) : (
            <div className="grid h-full min-h-[560px] place-items-center p-8 text-center">
              <div>
                <div className="text-lg font-semibold text-slate-950">No conversation selected</div>
                <p className="mt-2 text-sm text-slate-500">Choose a voice conversation from the list.</p>
              </div>
            </div>
          )}
        </section>

        <aside className="border-t border-slate-200 bg-white xl:border-l xl:border-t-0">
          {conversation ? (
            <div className="max-h-[760px] overflow-auto p-4">
              {lead ? (
                <form action={updateLeadAction} className="rounded-xl border border-slate-200 p-4">
                  <input type="hidden" name="id" value={lead.id} />
                  <input type="hidden" name="redirect_to" value={selectedHref(conversation.id, filter, q)} />
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <h4 className="font-semibold text-slate-950">Customer and lead</h4>
                    <StatusPill status={lead.status} />
                  </div>
                  <label className="block text-sm font-medium text-slate-700">
                    Lead status
                    <select name="status" defaultValue={lead.status} className={inputClass}>
                      {leadStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <div className="mt-3 grid gap-3">
                    <label className="block text-sm font-medium text-slate-700">
                      Client name
                      <input name="client_name" defaultValue={lead.client_name || lead.name || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Company
                      <input name="company_name" defaultValue={lead.company_name || ""} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Phone
                      <input name="phone" defaultValue={lead.phone || (lead.contact_type === "phone" ? lead.contact || "" : "")} className={inputClass} />
                    </label>
                    <label className="block text-sm font-medium text-slate-700">
                      Email
                      <input name="email" defaultValue={lead.email || (lead.contact_type === "email" ? lead.contact || "" : "")} className={inputClass} />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                      <label className="block text-sm font-medium text-slate-700">
                        LINE
                        <input name="line_id" defaultValue={lead.line_id || (lead.contact_type === "line" ? lead.contact || "" : "")} className={inputClass} />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        WhatsApp
                        <input name="whatsapp" defaultValue={lead.whatsapp || ""} className={inputClass} />
                      </label>
                    </div>
                    <label className="block text-sm font-medium text-slate-700">
                      Other contact
                      <input name="other_contact" defaultValue={lead.other_contact || (lead.contact_type === "other" ? lead.contact || "" : "")} className={inputClass} />
                    </label>
                    <div className="grid gap-3">
                      <label className="block text-sm font-medium text-slate-700">
                        Preferred contact
                        <input name="preferred_contact_method" defaultValue={lead.preferred_contact_method || ""} className={inputClass} />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Meeting day
                        <input name="preferred_meeting_day" defaultValue={lead.preferred_meeting_day || ""} className={inputClass} />
                      </label>
                      <label className="block text-sm font-medium text-slate-700">
                        Meeting time
                        <input name="preferred_meeting_time" defaultValue={lead.preferred_meeting_time || lead.preferred_time || ""} className={inputClass} />
                      </label>
                    </div>
                    <label className="block text-sm font-medium text-slate-700">
                      Admin notes
                      <textarea name="admin_notes" rows={4} defaultValue={lead.admin_notes || ""} className={inputClass} />
                    </label>
                  </div>
                  <button className="mt-4 w-full rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">Save lead</button>
                </form>
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">
                  <div className="font-semibold text-slate-950">No lead captured</div>
                  <p className="mt-1">This conversation remains in the no-lead view unless contact details are found later.</p>
                </div>
              )}

              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <h4 className="font-semibold text-slate-950">Appointments</h4>
                <div className="mt-3 grid gap-3">
                  {appointments.map((appointment) => (
                    <Link key={appointment.id} href="/admin/appointments" className="block rounded-lg bg-slate-50 p-3 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-slate-950">{appointment.client_name}</span>
                        <StatusPill status={appointment.status} />
                      </div>
                      <div className="mt-2 text-slate-600">
                        {new Date(appointment.start_at).toLocaleString()} - {new Date(appointment.end_at).toLocaleTimeString()}
                      </div>
                      <div className="mt-1 text-slate-500">
                        {[appointment.email, appointment.phone, appointment.assigned_admin_name].filter(Boolean).join(" · ")}
                      </div>
                    </Link>
                  ))}
                  {appointments.length === 0 ? <div className="text-sm text-slate-500">No linked appointments.</div> : null}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 p-4">
                <h4 className="font-semibold text-slate-950">Admin actions</h4>
                <div className="mt-3 grid gap-2">
                  <Link href={`/admin/conversations/${conversation.id}`} className="rounded-md border border-slate-200 px-3 py-2 text-center text-sm font-semibold text-slate-700">
                    Open detail page
                  </Link>
                  {admin.role === "master_admin" ? (
                    <form action={deleteConversationAction}>
                      <input type="hidden" name="id" value={conversation.id} />
                      <ConfirmSubmitButton
                        message="Delete this conversation? This hides it from normal admin lists."
                        className="w-full rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700"
                      >
                        Delete conversation
                      </ConfirmSubmitButton>
                    </form>
                  ) : null}
                </div>
              </div>
            </div>
          ) : (
            <div className="p-5 text-sm text-slate-500">Select a conversation to view customer, lead, appointment, and notes.</div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}
