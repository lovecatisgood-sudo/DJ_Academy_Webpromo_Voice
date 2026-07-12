import Link from "next/link";
import { AdminShell } from "./AdminShell";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

type Period = "today" | "7d" | "30d";

function periodSql(period: Period) {
  if (period === "today") return "1 day";
  if (period === "7d") return "7 days";
  return "30 days";
}

export default async function AdminOverview({
  searchParams,
}: {
  searchParams: Promise<{ period?: Period }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const period = params.period === "today" || params.period === "7d" || params.period === "30d" ? params.period : "7d";
  const sql = getSql();
  const interval = periodSql(period);
  const [stats] = (await sql`
    select
      count(*)::text as conversations,
      count(*) filter (where had_lead)::text as leads,
      round(avg(duration_seconds)) as avg_duration,
      case when count(*) = 0 then 0 else round((count(*) filter (where had_lead)::numeric / count(*)::numeric) * 100) end as capture_rate
    from conversations
    where started_at >= now() - ${interval}::interval
  `) as
    {
      conversations: string;
      leads: string;
      avg_duration: number | null;
      capture_rate: number | null;
    }[];
  const recent = (await sql`
    select id, started_at, duration_seconds, language, had_lead, page_url
    from conversations
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
    }[];

  return (
    <AdminShell>
      <div className="mb-5 flex gap-2">
        {(["today", "7d", "30d"] as Period[]).map((item) => (
          <Link
            key={item}
            href={`/admin?period=${item}`}
            className={`rounded-md border px-3 py-2 text-sm ${
              item === period ? "border-cyan-300/60 bg-cyan-300/15 text-cyan-100" : "border-white/10 bg-white/[0.04]"
            }`}
          >
            {item}
          </Link>
        ))}
      </div>
      <section className="grid gap-4 md:grid-cols-4">
        {[
          ["Conversations", stats?.conversations ?? "0"],
          ["Leads captured", stats?.leads ?? "0"],
          ["Avg duration", `${stats?.avg_duration ?? 0}s`],
          ["Capture rate", `${stats?.capture_rate ?? 0}%`],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
            <div className="text-sm text-slate-400">{label}</div>
            <div className="mt-2 text-3xl font-semibold text-white">{value}</div>
          </div>
        ))}
      </section>
      <section className="mt-6 rounded-lg border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-5 py-4 text-sm font-semibold text-slate-200">Recent conversations</div>
        <div className="divide-y divide-white/10">
          {recent.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/admin/conversations/${conversation.id}`}
              className="grid gap-2 px-5 py-4 text-sm hover:bg-white/[0.03] sm:grid-cols-[1fr_auto_auto]"
            >
              <span className="truncate text-slate-200">{conversation.page_url || conversation.id}</span>
              <span className="text-slate-400">{conversation.language || "unknown"} · {conversation.duration_seconds ?? 0}s</span>
              {conversation.had_lead ? (
                <span className="rounded-full bg-cyan-300/15 px-2 py-1 text-xs font-semibold text-cyan-100">Lead</span>
              ) : (
                <span className="text-slate-500">No lead</span>
              )}
            </Link>
          ))}
          {recent.length === 0 ? <div className="px-5 py-6 text-sm text-slate-400">No conversations yet.</div> : null}
        </div>
      </section>
    </AdminShell>
  );
}
