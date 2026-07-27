import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { requireAdmin } from "@/lib/admin-auth";
import { currentIntlLocale } from "@/lib/browser-locale";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const admin = await requireAdmin();
  const sql = getSql();
  const [voiceStats] = (await sql`
    select
      count(*)::text as conversations,
      count(*) filter (where channel = 'voice_widget')::text as voice_conversations,
      count(*) filter (where channel = 'text_widget')::text as text_conversations,
      count(*) filter (where had_lead)::text as leads,
      max(started_at) as last_started_at,
      (select agent_enabled from settings where id = 1 limit 1) as agent_enabled,
      (select text_chat_enabled from settings where id = 1 limit 1) as text_chat_enabled
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
  `) as {
    conversations: string;
    voice_conversations: string;
    text_conversations: string;
    leads: string;
    last_started_at: string | null;
    agent_enabled: boolean | null;
    text_chat_enabled: boolean | null;
  }[];

  const futureChannels = [
    ["FlowBot Widget", "Future deterministic flow-bot channel"],
    ["LINE", "Future LINE messaging channel"],
    ["WhatsApp", "Future WhatsApp messaging channel"],
    ["Messenger", "Future Facebook Messenger channel"],
    ["Phone Voice", "Future phone-call voice channel"],
  ];

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-slate-950">Inbox</h2>
        <p className="mt-1 text-sm text-slate-600">
          Consolidated channel workspace for the website voicebot and text chatbot.
        </p>
      </div>

      <section className="mb-8">
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Connected channels</div>
        <Link
          href="/admin/inbox/voice"
          className="block max-w-sm rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-cyan-300"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="grid h-11 w-11 place-items-center rounded-xl bg-[#0e7c86] text-xs font-bold text-white">VW</div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              voiceStats?.agent_enabled || voiceStats?.text_chat_enabled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              {voiceStats?.agent_enabled || voiceStats?.text_chat_enabled ? "Active" : "Disabled"}
            </span>
          </div>
          <h3 className="mt-4 text-lg font-semibold text-slate-950">Website Agent Widget</h3>
          <p className="mt-1 text-sm text-slate-600">Live voice and text conversations from the embedded DJAI website agent.</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Voice calls</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{voiceStats?.voice_conversations ?? "0"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Text chats</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{voiceStats?.text_conversations ?? "0"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Conversations</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{voiceStats?.conversations ?? "0"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Leads</div>
              <div className="mt-1 text-xl font-semibold text-slate-950">{voiceStats?.leads ?? "0"}</div>
            </div>
          </div>
          <div className="mt-4 text-sm text-slate-500">
            Last activity: {voiceStats?.last_started_at ? new Date(voiceStats.last_started_at).toLocaleString(currentIntlLocale()) : "No conversations yet"}
          </div>
        </Link>
      </section>

      <section>
        <div className="mb-3 text-xs font-bold uppercase tracking-wide text-slate-500">Future channels</div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {futureChannels.map(([name, description]) => (
            <div key={name} className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-5 text-slate-600">
              <div className="flex items-start justify-between gap-4">
                <div className="grid h-10 w-10 place-items-center rounded-lg bg-slate-100 text-xs font-bold text-slate-500">
                  {name.slice(0, 2).toUpperCase()}
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-500">Future</span>
              </div>
              <h3 className="mt-4 font-semibold text-slate-800">{name}</h3>
              <p className="mt-1 text-sm">{description}. Not connected in this version.</p>
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
