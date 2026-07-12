import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { cycleLeadStatusAction } from "../actions";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

type Status = "all" | "new" | "contacted" | "closed";

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: Status }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const status = params.status === "new" || params.status === "contacted" || params.status === "closed" ? params.status : "all";
  const sql = getSql();
  const leads = (await sql`
    select *
    from leads
    where ${status} = 'all' or status = ${status}
    order by created_at desc
    limit 200
  `) as
    {
      id: string;
      conversation_id: string | null;
      created_at: string;
      name: string | null;
      contact: string | null;
      contact_type: string | null;
      need: string | null;
      preferred_time: string | null;
      status: string;
    }[];

  return (
    <AdminShell>
      <div className="mb-5 flex flex-wrap gap-2">
        {(["all", "new", "contacted", "closed"] as Status[]).map((item) => (
          <Link
            key={item}
            href={`/admin/leads?status=${item}`}
            className={`rounded-md border px-3 py-2 text-sm ${
              item === status ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.04]"
            }`}
          >
            {item}
          </Link>
        ))}
      </div>
      <section className="rounded-lg border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-5 py-4 text-sm font-semibold text-slate-200">Leads</div>
        <div className="divide-y divide-white/10">
          {leads.map((lead) => (
            <div key={lead.id} className="grid gap-3 px-5 py-4 text-sm md:grid-cols-[1fr_180px_140px]">
              <div>
                <div className="font-semibold text-white">{lead.name || "Unnamed"} · {lead.contact || "No contact"}</div>
                <div className="mt-1 text-slate-300">{lead.need}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {lead.contact_type} · preferred {lead.preferred_time || "not set"} · {new Date(lead.created_at).toLocaleString()}
                </div>
              </div>
              <Link className="text-cyan-200" href={`/admin/conversations/${lead.conversation_id}`}>
                View conversation
              </Link>
              <form action={cycleLeadStatusAction}>
                <input type="hidden" name="id" value={lead.id} />
                <input type="hidden" name="status" value={lead.status} />
                <button className="rounded-md border border-cyan-300/30 bg-cyan-300/10 px-3 py-2 text-cyan-100">
                  {lead.status}
                </button>
              </form>
            </div>
          ))}
          {leads.length === 0 ? <div className="px-5 py-6 text-sm text-slate-400">No leads yet.</div> : null}
        </div>
      </section>
    </AdminShell>
  );
}
