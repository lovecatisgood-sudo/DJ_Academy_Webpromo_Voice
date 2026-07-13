import Link from "next/link";
import { AdminShell } from "../AdminShell";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function ChannelsPage() {
  await requireAdmin();
  const sql = getSql();
  const [settings] = (await sql`
    select agent_enabled, booking_enabled, voice_provider, model_id
    from settings
    where id = 1
    limit 1
  `) as { agent_enabled: boolean; booking_enabled: boolean; voice_provider: string; model_id: string }[];
  const futureChannels = ["Web Text Chat", "FlowBot Widget", "LINE", "WhatsApp", "Messenger", "Phone Voice"];

  return (
    <AdminShell>
      <div className="mb-5">
        <h2 className="text-2xl font-semibold text-slate-950">Channels</h2>
        <p className="mt-1 text-sm text-slate-600">
          Manage connected conversation channels. This version only enables the Website Voice Widget.
        </p>
      </div>

      <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-slate-950">Website Voice Widget</h3>
              <p className="mt-1 text-sm text-slate-600">Production voice agent embedded on the website.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
              settings?.agent_enabled ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
            }`}>
              {settings?.agent_enabled ? "Connected" : "Disabled"}
            </span>
          </div>
          <div className="mt-5 grid gap-3 text-sm md:grid-cols-2">
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Provider</div>
              <div className="mt-1 font-semibold text-slate-900">{settings?.voice_provider || "Not configured"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Model</div>
              <div className="mt-1 font-semibold text-slate-900">{settings?.model_id || "Not configured"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Booking CTA</div>
              <div className="mt-1 font-semibold text-slate-900">{settings?.booking_enabled ? "Enabled" : "Disabled"}</div>
            </div>
            <div className="rounded-lg bg-slate-50 p-3">
              <div className="text-xs text-slate-500">Workspace</div>
              <Link href="/admin/inbox/voice" className="mt-1 inline-block font-semibold text-cyan-700">Open Inbox</Link>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/admin/settings" className="rounded-md bg-[#0e7c86] px-4 py-2 text-sm font-semibold text-white">
              Manage settings
            </Link>
            <Link href="/admin/inbox" className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700">
              View inbox channels
            </Link>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h3 className="text-lg font-semibold text-slate-950">Future channel roadmap</h3>
          <p className="mt-1 text-sm text-slate-600">
            These cards are placeholders only. They do not represent working integrations in this build.
          </p>
          <div className="mt-5 grid gap-3">
            {futureChannels.map((channel) => (
              <div key={channel} className="flex items-center justify-between gap-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-3">
                <div>
                  <div className="font-semibold text-slate-800">{channel}</div>
                  <div className="text-sm text-slate-500">Not connected in this version.</div>
                </div>
                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-600">Future</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}
