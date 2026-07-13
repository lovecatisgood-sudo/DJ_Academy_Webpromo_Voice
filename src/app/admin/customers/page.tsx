import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function CustomersPage() {
  const admin = await requireAdmin();
  const sql = getSql();
  const profiles = (await sql`
    select
      coalesce(client_name, name, 'Unnamed') as client_name,
      company_name,
      phone,
      email,
      line_id,
      whatsapp,
      max(created_at) as last_seen_at,
      count(*)::text as lead_count,
      max(status) as latest_status,
      max(conversation_id::text) as conversation_id
    from leads
    where (
        ${admin.role === "master_admin"}::boolean
        or assigned_admin_id = ${admin.id}
      )
      and (
        client_name is not null
        or name is not null
        or phone is not null
        or email is not null
        or line_id is not null
        or whatsapp is not null
      )
    group by coalesce(client_name, name, 'Unnamed'), company_name, phone, email, line_id, whatsapp
    order by max(created_at) desc
    limit 100
  `) as {
    client_name: string;
    company_name: string | null;
    phone: string | null;
    email: string | null;
    line_id: string | null;
    whatsapp: string | null;
    last_seen_at: string;
    lead_count: string;
    latest_status: string | null;
    conversation_id: string | null;
  }[];

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-slate-950">Customers</h2>
        <p className="mt-1 text-sm text-slate-600">
          Lightweight contact profiles derived from captured leads. Database profile merging is not automatic in this version.
        </p>
      </div>

      <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4 text-sm font-semibold text-slate-700">Contact profiles</div>
        <div className="divide-y divide-slate-100">
          {profiles.map((profile) => (
            <div key={`${profile.client_name}-${profile.email || profile.phone || profile.line_id || profile.whatsapp}`} className="grid gap-4 px-5 py-4 text-sm lg:grid-cols-[1fr_280px_140px]">
              <div>
                <div className="font-semibold text-slate-950">
                  {profile.client_name}{profile.company_name ? ` · ${profile.company_name}` : ""}
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-slate-600">
                  {profile.phone ? <span>Phone: {profile.phone}</span> : null}
                  {profile.email ? <span>Email: {profile.email}</span> : null}
                  {profile.line_id ? <span>LINE: {profile.line_id}</span> : null}
                  {profile.whatsapp ? <span>WhatsApp: {profile.whatsapp}</span> : null}
                </div>
              </div>
              <div className="text-slate-600">
                <div>Leads: {profile.lead_count}</div>
                <div>Status: {profile.latest_status?.replaceAll("_", " ") || "unknown"}</div>
                <div>Last seen: {new Date(profile.last_seen_at).toLocaleString()}</div>
              </div>
              <div className="flex items-start justify-end">
                {profile.conversation_id ? (
                  <Link href={`/admin/conversations/${profile.conversation_id}`} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700">
                    Open
                  </Link>
                ) : null}
              </div>
            </div>
          ))}
          {profiles.length === 0 ? (
            <div className="px-5 py-8 text-sm text-slate-500">No captured customer/contact profiles yet.</div>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
