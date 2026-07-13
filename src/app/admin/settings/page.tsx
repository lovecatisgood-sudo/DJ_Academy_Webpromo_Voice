import { AdminShell } from "../AdminShell";
import { changeOwnPasswordAction, saveSettingsAction } from "../actions";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import type { Settings } from "@/lib/types";

export const dynamic = "force-dynamic";

const inputClass = "mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm";
const textAreaClass = "mt-2 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 shadow-sm";
const sectionClass = "rounded-xl border border-slate-200 bg-white p-5 shadow-sm";
const labelClass = "block text-sm font-medium text-slate-700";
const helpClass = "mt-2 block text-xs text-slate-500";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; password?: string }>;
}) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const sql = getSql();
  const rows = (await sql`select * from settings where id = 1 limit 1`) as Settings[];
  const settings = rows[0];
  const activeAdmins = admin.role === "master_admin"
    ? (await sql`
        select id, name, username
        from admin_users
        where is_active = true
          and deleted_at is null
        order by role desc, name asc
      `) as { id: string; name: string; username: string }[]
    : [];

  if (admin.role !== "master_admin") {
    return (
      <AdminShell>
        {params.saved ? (
          <div className="mb-5 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
            Settings updated.
          </div>
        ) : null}
        {params.password ? (
          <div className={`mb-5 rounded-md border px-4 py-3 text-sm ${
            params.password === "updated"
              ? "border-cyan-200 bg-cyan-50 text-cyan-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}>
            {params.password === "updated" ? "Password updated." : "Password update failed. Check the current password and confirmation."}
          </div>
        ) : null}
        <section className={sectionClass}>
          <h2 className="text-lg font-semibold text-slate-950">Profile</h2>
          <div className="mt-4 grid gap-4 text-sm text-slate-600 sm:grid-cols-2">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="text-slate-500">Name</div>
              <div className="mt-1 font-semibold text-slate-950">{admin.name}</div>
            </div>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="text-slate-500">Username</div>
              <div className="mt-1 font-semibold text-slate-950">{admin.username}</div>
            </div>
          </div>
        </section>
        <form action={changeOwnPasswordAction} className={`mt-5 ${sectionClass}`}>
          <h2 className="text-lg font-semibold text-slate-950">Change password</h2>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className={labelClass}>
              Current password
              <input name="current_password" type="password" className={inputClass} autoComplete="current-password" required />
            </label>
            <label className={labelClass}>
              New password
              <input name="new_password" type="password" minLength={10} className={inputClass} autoComplete="new-password" required />
            </label>
            <label className={labelClass}>
              Confirm new password
              <input name="confirm_password" type="password" minLength={10} className={inputClass} autoComplete="new-password" required />
            </label>
          </div>
          <button className="mt-5 rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-4 py-2 font-semibold text-white">
            Update password
          </button>
        </form>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      {params.saved ? (
        <div className="mb-5 rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm text-cyan-800">
          Settings saved. Knowledge version {settings.knowledge_version} applies to new sessions immediately.
        </div>
      ) : null}

      <form action={saveSettingsAction} className="space-y-5">
        <section className={sectionClass}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Voice agent</h2>
              <p className="mt-1 text-sm text-slate-600">Live-call availability, greeting, language, and call limits.</p>
            </div>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              <input name="agent_enabled" type="checkbox" defaultChecked={settings.agent_enabled} />
              Agent enabled
            </label>
          </div>
          <label className={labelClass}>
            Greeting
            <textarea name="greeting" rows={3} className={textAreaClass} defaultValue={settings.greeting || ""} />
          </label>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <label className={labelClass}>
              Language mode
              <input name="language_mode" className={inputClass} defaultValue={settings.language_mode} />
            </label>
            <label className={labelClass}>
              Max call seconds
              <input name="max_call_seconds" type="number" min={60} className={inputClass} defaultValue={settings.max_call_seconds} />
            </label>
            <label className={labelClass}>
              Daily session cap
              <input name="daily_session_cap" type="number" min={1} className={inputClass} defaultValue={settings.daily_session_cap} />
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Booking</h2>
              <p className="mt-1 text-sm text-slate-600">Controls the public booking page and the voice-widget booking CTA.</p>
            </div>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              <input name="booking_enabled" type="checkbox" defaultChecked={settings.booking_enabled} />
              Booking enabled
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Active AI booking admin
              <select name="active_booking_admin_id" className={inputClass} defaultValue={settings.active_booking_admin_id || ""}>
                <option value="">No active booking admin</option>
                {activeAdmins.map((item) => (
                  <option key={item.id} value={item.id}>{item.name} ({item.username})</option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              Default timezone
              <input name="default_timezone" className={inputClass} defaultValue={settings.default_timezone || "Asia/Bangkok"} />
            </label>
            <label className={labelClass}>
              Booking window days
              <input name="default_booking_window_days" type="number" min={1} max={365} className={inputClass} defaultValue={settings.default_booking_window_days || 30} />
            </label>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700 md:mt-7">
              <input name="require_booking_confirmation" type="checkbox" defaultChecked={settings.require_booking_confirmation} />
              Require admin confirmation
            </label>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Post-call analysis</h2>
              <p className="mt-1 text-sm text-slate-600">Summary, lead extraction, interest level, objections, and next action.</p>
            </div>
            <label className="flex items-center gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
              <input name="analysis_enabled" type="checkbox" defaultChecked={settings.analysis_enabled} />
              Analysis enabled
            </label>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Analysis model
              <input name="analysis_model_id" className={inputClass} defaultValue={settings.analysis_model_id || "gpt-4o-mini"} />
              <span className={helpClass}>
                This is for text analysis after the call. It does not affect the live voice model.
              </span>
            </label>
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              Conversations with usable contact details become leads automatically. Admin edits to lead status and notes are kept separate from the voice model.
            </div>
          </div>
        </section>

        <section className={sectionClass}>
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Knowledge document</h2>
              <p className="mt-1 text-sm text-slate-600">The voice agent may only state facts that appear here.</p>
            </div>
            <span className="text-sm text-slate-500">Version {settings.knowledge_version}</span>
          </div>
          <textarea
            name="knowledge_md"
            rows={28}
            className="mt-5 w-full rounded-md border border-slate-200 bg-white px-3 py-2 font-mono text-sm leading-6 text-slate-900 shadow-sm"
            defaultValue={settings.knowledge_md || ""}
          />
        </section>

        <section className={sectionClass}>
          <h2 className="text-lg font-semibold text-slate-950">Advanced voice provider</h2>
          <p className="mt-1 text-sm text-slate-600">Switch between OpenAI Realtime and Gemini Live without redeploying.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className={labelClass}>
              Voice provider
              <select name="voice_provider" className={inputClass} defaultValue={settings.voice_provider || "openai"}>
                <option value="openai">OpenAI Realtime</option>
                <option value="gemini">Gemini Live Preview</option>
              </select>
            </label>
            <label className={labelClass}>
              Voice
              <input name="voice" className={inputClass} defaultValue={settings.voice} />
            </label>
            <label className={labelClass}>
              Live model ID
              <input name="model_id" className={inputClass} defaultValue={settings.model_id} />
              <span className={helpClass}>
                OpenAI: gpt-realtime-2.1. Gemini: gemini-3.1-flash-live-preview.
              </span>
            </label>
            <label className={labelClass}>
              Transcription model
              <input name="transcription_model" className={inputClass} defaultValue={settings.transcription_model} />
            </label>
          </div>
        </section>

        <div className="sticky bottom-4 flex justify-end">
          <button className="rounded-md bg-gradient-to-r from-cyan-400 to-blue-600 px-5 py-3 font-semibold text-white shadow-lg shadow-blue-950/40">
            Save settings
          </button>
        </div>
      </form>
    </AdminShell>
  );
}
