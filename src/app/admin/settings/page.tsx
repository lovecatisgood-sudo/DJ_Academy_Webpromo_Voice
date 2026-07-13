import { AdminShell } from "../AdminShell";
import { saveSettingsAction } from "../actions";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string }>;
}) {
  await requireAdmin();
  const params = await searchParams;
  const sql = getSql();
  const rows = (await sql`select * from settings where id = 1 limit 1`) as Settings[];
  const settings = rows[0];

  return (
    <AdminShell>
      {params.saved ? (
        <div className="mb-5 rounded-md border border-cyan-300/30 bg-cyan-300/10 px-4 py-3 text-sm text-cyan-100">
          Settings saved. Knowledge version {settings.knowledge_version} applies to new sessions immediately.
        </div>
      ) : null}
      <form action={saveSettingsAction} className="grid gap-5 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <h2 className="text-lg font-semibold text-white">Controls</h2>
          <label className="mt-5 flex items-center gap-3 text-sm text-slate-200">
            <input name="agent_enabled" type="checkbox" defaultChecked={settings.agent_enabled} />
            Agent enabled
          </label>
          <label className="mt-5 block text-sm text-slate-300">
            Greeting
            <textarea
              name="greeting"
              rows={4}
              className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
              defaultValue={settings.greeting || ""}
            />
          </label>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Voice provider
              <select
                name="voice_provider"
                className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
                defaultValue={settings.voice_provider || "openai"}
              >
                <option value="openai">OpenAI Realtime</option>
                <option value="gemini">Gemini Live Preview</option>
              </select>
            </label>
            <label className="block text-sm text-slate-300">
              Voice
              <input
                name="voice"
                className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
                defaultValue={settings.voice}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Language mode
              <input
                name="language_mode"
                className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
                defaultValue={settings.language_mode}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Max call seconds
              <input
                name="max_call_seconds"
                type="number"
                min={60}
                className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
                defaultValue={settings.max_call_seconds}
              />
            </label>
            <label className="block text-sm text-slate-300">
              Daily session cap
              <input
                name="daily_session_cap"
                type="number"
                min={1}
                className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
                defaultValue={settings.daily_session_cap}
              />
            </label>
          </div>
          <label className="mt-5 block text-sm text-slate-300">
            Model ID
            <input
              name="model_id"
              className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
              defaultValue={settings.model_id}
            />
            <span className="mt-2 block text-xs text-slate-500">
              Use `gpt-realtime-2.1` for OpenAI or `gemini-3.1-flash-live-preview` for Gemini.
            </span>
          </label>
          <label className="mt-5 block text-sm text-slate-300">
            Transcription model
            <input
              name="transcription_model"
              className="mt-2 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 text-white"
              defaultValue={settings.transcription_model}
            />
          </label>
          <button className="mt-6 rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white">
            Save settings
          </button>
        </section>
        <section className="rounded-lg border border-white/10 bg-white/[0.04] p-5">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold text-white">Knowledge document</h2>
            <span className="text-sm text-slate-400">Version {settings.knowledge_version}</span>
          </div>
          <textarea
            name="knowledge_md"
            rows={28}
            className="mt-5 w-full rounded-md border border-white/10 bg-[#0a1128] px-3 py-2 font-mono text-sm leading-6 text-slate-100"
            defaultValue={settings.knowledge_md || ""}
          />
        </section>
      </form>
    </AdminShell>
  );
}
