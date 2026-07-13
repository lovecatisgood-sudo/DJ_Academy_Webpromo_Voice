import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { updateLeadAction } from "../actions";
import { InterestPill } from "../components/InterestPill";
import { StatusPill } from "../components/StatusPill";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { LeadStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

type StatusFilter = "all" | LeadStatus;

const statuses: { key: StatusFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_follow_up", label: "Pending follow up" },
  { key: "appointment_set", label: "Appointment set" },
  { key: "follow_up_later", label: "Follow up later" },
  { key: "deal_closed", label: "Deal closed" },
  { key: "no_deal", label: "No deal" },
];

const inputClass = "mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900";

function statusValue(value: unknown): StatusFilter {
  return value === "pending_follow_up" ||
    value === "appointment_set" ||
    value === "follow_up_later" ||
    value === "deal_closed" ||
    value === "no_deal"
    ? value
    : "all";
}

function contactLine(lead: {
  phone: string | null;
  email: string | null;
  line_id: string | null;
  whatsapp: string | null;
  other_contact: string | null;
  contact: string | null;
}) {
  return [
    lead.phone ? `Phone: ${lead.phone}` : "",
    lead.email ? `Email: ${lead.email}` : "",
    lead.line_id ? `LINE: ${lead.line_id}` : "",
    lead.whatsapp ? `WhatsApp: ${lead.whatsapp}` : "",
    lead.other_contact ? `Other: ${lead.other_contact}` : "",
  ].filter(Boolean).join(" · ") || lead.contact || "No contact";
}

function leadHref(id: string, status: StatusFilter, q: string) {
  return `/admin/leads?id=${id}&status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
}

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; status?: StatusFilter; q?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const status = statusValue(params.status);
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const search = `%${q}%`;
  const sql = getSql();
  const leads = (await sql`
    select
      leads.*,
      conversations.summary,
      conversations.main_problem,
      conversations.interest_level,
      conversations.concern_or_objection,
      conversations.recommended_service,
      conversations.next_action,
      conversations.started_at as conversation_started_at,
      admin_users.name as assigned_admin_name,
      appointment.status as appointment_status,
      appointment.start_at as appointment_start_at
    from leads
    left join conversations on conversations.id = leads.conversation_id
    left join admin_users on admin_users.id = leads.assigned_admin_id
    left join lateral (
      select status, start_at
      from appointments
      where appointments.lead_id = leads.id
        and appointments.deleted_at is null
      order by appointments.start_at desc
      limit 1
    ) appointment on true
    where (${status} = 'all' or leads.status = ${status})
      and (conversations.deleted_at is null or conversations.id is null)
      and (
        ${admin.role === "master_admin"}::boolean
        or leads.assigned_admin_id = ${admin.id}
      )
      and (
        ${q} = ''
        or coalesce(leads.client_name, leads.name, '') ilike ${search}
        or coalesce(leads.company_name, '') ilike ${search}
        or coalesce(leads.phone, leads.email, leads.line_id, leads.whatsapp, leads.other_contact, leads.contact, '') ilike ${search}
        or coalesce(conversations.main_problem, '') ilike ${search}
        or coalesce(conversations.recommended_service, '') ilike ${search}
      )
    order by leads.updated_at desc nulls last, leads.created_at desc
    limit 200
  `) as {
    id: string;
    conversation_id: string | null;
    created_at: string;
    updated_at: string | null;
    name: string | null;
    contact: string | null;
    need: string | null;
    preferred_time: string | null;
    status: LeadStatus;
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
    summary: string | null;
    main_problem: string | null;
    interest_level: string | null;
    concern_or_objection: string | null;
    recommended_service: string | null;
    next_action: string | null;
    conversation_started_at: string | null;
    assigned_admin_name: string | null;
    appointment_status: string | null;
    appointment_start_at: string | null;
  }[];
  const selectedLead = leads.find((lead) => lead.id === params.id) || leads[0];
  const exportHref = `/api/admin/export/leads.csv?status=${status}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  return (
    <AdminShell>
      <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-950">Leads</h2>
          <p className="mt-1 text-sm text-slate-600">Sales pipeline for captured contacts, status, notes, and follow-up actions.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <form className="flex flex-wrap gap-2">
            <input type="hidden" name="status" value={status} />
            <input
              name="q"
              defaultValue={q}
              placeholder="Search leads"
              className="w-64 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
            <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700">Search</button>
          </form>
          <a href={exportHref} className="rounded-md bg-[#0e7c86] px-3 py-2 text-sm font-semibold text-white">
            Export CSV
          </a>
        </div>
      </div>

      <div className="mb-5 flex flex-wrap gap-2">
        {statuses.map((item) => (
          <Link
            key={item.key}
            href={`/admin/leads?status=${item.key}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={`rounded-full border px-3 py-1.5 text-sm font-semibold ${
              item.key === status ? "border-[#0e7c86] bg-[#0e7c86] text-white" : "border-slate-200 bg-white text-slate-700"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </div>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">
            Lead pipeline · {leads.length}
          </div>
          <div className="divide-y divide-slate-100">
            {leads.map((lead) => (
              <Link
                key={lead.id}
                href={leadHref(lead.id, status, q)}
                className={`grid gap-4 px-5 py-4 text-sm hover:bg-cyan-50/40 lg:grid-cols-[1fr_220px_160px] ${
                  selectedLead?.id === lead.id ? "bg-cyan-50/70" : ""
                }`}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="truncate font-semibold text-slate-950">
                      {lead.client_name || lead.name || "Unnamed"}{lead.company_name ? ` · ${lead.company_name}` : ""}
                    </div>
                    <StatusPill status={lead.status} />
                    <InterestPill value={lead.interest_level} />
                  </div>
                  <div className="mt-2 text-slate-600">{contactLine(lead)}</div>
                  <div className="mt-2 line-clamp-2 text-slate-700">{lead.main_problem || lead.need || lead.summary || "No summary yet."}</div>
                  <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
                    <span>Service: {lead.recommended_service || "Not captured"}</span>
                    <span>Next: {lead.next_action || "Not captured"}</span>
                  </div>
                </div>
                <div className="text-slate-600">
                  <div>Assigned: {lead.assigned_admin_name || "Unassigned"}</div>
                  <div className="mt-1">
                    Appointment: {lead.appointment_status ? `${lead.appointment_status.replaceAll("_", " ")}${lead.appointment_start_at ? ` · ${new Date(lead.appointment_start_at).toLocaleString()}` : ""}` : "None"}
                  </div>
                  {lead.concern_or_objection ? <div className="mt-1">Concern: {lead.concern_or_objection}</div> : null}
                </div>
                <div className="text-slate-500 lg:text-right">
                  <div>Updated</div>
                  <div className="font-medium text-slate-700">
                    {lead.updated_at ? new Date(lead.updated_at).toLocaleString() : new Date(lead.created_at).toLocaleString()}
                  </div>
                  {lead.conversation_id ? <div className="mt-2 text-cyan-700">Open conversation</div> : null}
                </div>
              </Link>
            ))}
            {leads.length === 0 ? <div className="px-5 py-8 text-sm text-slate-500">No leads in this view.</div> : null}
          </div>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          {selectedLead ? (
            <form action={updateLeadAction}>
              <input type="hidden" name="id" value={selectedLead.id} />
              <input type="hidden" name="redirect_to" value={leadHref(selectedLead.id, status, q)} />
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-slate-950">Lead detail</h3>
                  <p className="mt-1 text-sm text-slate-500">{selectedLead.conversation_started_at ? `From ${new Date(selectedLead.conversation_started_at).toLocaleString()}` : "Manual or imported lead"}</p>
                </div>
                <StatusPill status={selectedLead.status} />
              </div>

              <label className="block text-sm font-medium text-slate-700">
                Status
                <select name="status" defaultValue={selectedLead.status} className={inputClass}>
                  {statuses.filter((item) => item.key !== "all").map((item) => (
                    <option key={item.key} value={item.key}>{item.label}</option>
                  ))}
                </select>
              </label>

              <div className="mt-4 grid gap-3">
                <label className="block text-sm font-medium text-slate-700">
                  Client name
                  <input name="client_name" defaultValue={selectedLead.client_name || selectedLead.name || ""} className={inputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Company
                  <input name="company_name" defaultValue={selectedLead.company_name || ""} className={inputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Phone
                  <input name="phone" defaultValue={selectedLead.phone || ""} className={inputClass} />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input name="email" defaultValue={selectedLead.email || ""} className={inputClass} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700">
                    LINE
                    <input name="line_id" defaultValue={selectedLead.line_id || ""} className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    WhatsApp
                    <input name="whatsapp" defaultValue={selectedLead.whatsapp || ""} className={inputClass} />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700">
                  Other contact
                  <input name="other_contact" defaultValue={selectedLead.other_contact || ""} className={inputClass} />
                </label>
                <div className="grid gap-3">
                  <label className="block text-sm font-medium text-slate-700">
                    Preferred contact
                    <input name="preferred_contact_method" defaultValue={selectedLead.preferred_contact_method || ""} className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Meeting day
                    <input name="preferred_meeting_day" defaultValue={selectedLead.preferred_meeting_day || ""} className={inputClass} />
                  </label>
                  <label className="block text-sm font-medium text-slate-700">
                    Meeting time
                    <input name="preferred_meeting_time" defaultValue={selectedLead.preferred_meeting_time || selectedLead.preferred_time || ""} className={inputClass} />
                  </label>
                </div>
                <label className="block text-sm font-medium text-slate-700">
                  Admin notes
                  <textarea name="admin_notes" rows={4} defaultValue={selectedLead.admin_notes || ""} className={inputClass} />
                </label>
              </div>

              <button className="mt-4 w-full rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">
                Save lead
              </button>
              <div className="mt-4 flex flex-wrap gap-3 text-sm">
                {selectedLead.conversation_id ? (
                  <Link className="font-semibold text-cyan-700" href={`/admin/inbox/voice?id=${selectedLead.conversation_id}`}>
                    Open in Inbox
                  </Link>
                ) : null}
                {selectedLead.appointment_status ? (
                  <Link className="font-semibold text-cyan-700" href="/admin/appointments">
                    Open appointment
                  </Link>
                ) : null}
              </div>
            </form>
          ) : (
            <div className="text-sm text-slate-500">Select a lead from the list.</div>
          )}
        </aside>
      </section>
    </AdminShell>
  );
}
