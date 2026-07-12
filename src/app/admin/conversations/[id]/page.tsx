import { notFound } from "next/navigation";
import { AdminShell } from "../../AdminShell";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { TranscriptItem } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ConversationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const sql = getSql();
  const conversations = (await sql`select * from conversations where id = ${id} limit 1`) as
    {
      id: string;
      started_at: string;
      duration_seconds: number | null;
      language: string | null;
      page_url: string | null;
      transcript: TranscriptItem[] | null;
      had_lead: boolean;
    }[];
  const conversation = conversations[0];
  if (!conversation) notFound();

  const leads = (await sql`select * from leads where conversation_id = ${id} order by created_at desc`) as
    {
      id: string;
      name: string | null;
      contact: string | null;
      contact_type: string | null;
      need: string | null;
      preferred_time: string | null;
      status: string;
    }[];

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-xl font-semibold text-white">Conversation detail</h2>
        <p className="mt-1 text-sm text-slate-400">
          {conversation.language || "unknown"} · {conversation.duration_seconds ?? 0}s · {conversation.page_url || "unknown page"}
        </p>
      </div>

      {leads.length ? (
        <section className="mb-5 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-5">
          <div className="text-sm font-semibold text-cyan-100">Captured lead</div>
          {leads.map((lead) => (
            <div key={lead.id} className="mt-3 grid gap-2 text-sm text-slate-200 md:grid-cols-2">
              <div>Name: {lead.name}</div>
              <div>Contact: {lead.contact} ({lead.contact_type})</div>
              <div>Need: {lead.need}</div>
              <div>Preferred time: {lead.preferred_time}</div>
            </div>
          ))}
        </section>
      ) : null}

      <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
        <div className="mb-4 text-sm font-semibold text-slate-200">Transcript</div>
        <div className="space-y-3">
          {(conversation.transcript || []).map((item, index) => (
            <div
              key={`${item.t}-${index}`}
              className={`max-w-3xl rounded-lg px-4 py-3 text-sm ${
                item.role === "assistant"
                  ? "bg-blue-400/12 text-blue-50"
                  : item.role === "tool"
                    ? "bg-cyan-300/12 text-cyan-50"
                    : "bg-white/[0.06] text-slate-100"
              }`}
            >
              <div className="mb-1 text-xs uppercase tracking-wide text-slate-400">{item.role}</div>
              {item.text}
            </div>
          ))}
          {!(conversation.transcript || []).length ? (
            <div className="text-sm text-slate-400">No transcript saved.</div>
          ) : null}
        </div>
      </section>
    </AdminShell>
  );
}
