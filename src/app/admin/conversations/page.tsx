import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ConversationsPage() {
  await requireAdmin();
  const sql = getSql();
  const conversations = (await sql`
    select id, started_at, ended_at, duration_seconds, language, page_url, had_lead
    from conversations
    order by started_at desc
    limit 100
  `) as
    {
      id: string;
      started_at: string;
      ended_at: string | null;
      duration_seconds: number | null;
      language: string | null;
      page_url: string | null;
      had_lead: boolean;
    }[];

  return (
    <AdminShell>
      <section className="rounded-lg border border-white/10 bg-white/[0.04]">
        <div className="border-b border-white/10 px-5 py-4 text-sm font-semibold text-slate-200">Conversations</div>
        <div className="divide-y divide-white/10">
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={`/admin/conversations/${conversation.id}`}
              className="grid gap-2 px-5 py-4 text-sm hover:bg-white/[0.03] md:grid-cols-[1fr_130px_90px_70px]"
            >
              <span className="truncate text-slate-200">{conversation.page_url || conversation.id}</span>
              <span className="text-slate-400">{new Date(conversation.started_at).toLocaleString()}</span>
              <span className="text-slate-400">{conversation.duration_seconds ?? 0}s</span>
              <span className={conversation.had_lead ? "text-cyan-200" : "text-slate-500"}>
                {conversation.had_lead ? "Lead" : "No lead"}
              </span>
            </Link>
          ))}
          {conversations.length === 0 ? <div className="px-5 py-6 text-sm text-slate-400">No conversations yet.</div> : null}
        </div>
      </section>
    </AdminShell>
  );
}
