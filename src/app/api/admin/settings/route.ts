import { NextResponse } from "next/server";
import { requireMasterAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings-cache";
import { readJsonBody } from "@/lib/http-guards";
import { normalizeSettingsInput } from "@/lib/settings-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireMasterAdmin();
  const sql = getSql();
  const rows = (await sql`select * from settings where id = 1 limit 1`) as Record<string, unknown>[];
  return NextResponse.json(rows[0] || null);
}

export async function PATCH(request: Request) {
  await requireMasterAdmin();
  const body = (await readJsonBody(request, 70000)) as Record<string, unknown>;
  const settings = normalizeSettingsInput(body, "patch");
  const sql = getSql();

  await sql`
    update settings set
      agent_enabled = coalesce(${settings.agent_enabled ?? null}, agent_enabled),
      greeting = coalesce(${settings.greeting ?? null}, greeting),
      voice = coalesce(${settings.voice ?? null}, voice),
      voice_provider = coalesce(${settings.voice_provider ?? null}, voice_provider),
      language_mode = coalesce(${settings.language_mode ?? null}, language_mode),
      knowledge_md = coalesce(${settings.knowledge_md ?? null}, knowledge_md),
      max_call_seconds = coalesce(${settings.max_call_seconds ?? null}, max_call_seconds),
      daily_session_cap = coalesce(${settings.daily_session_cap ?? null}, daily_session_cap),
      model_id = coalesce(${settings.model_id ?? null}, model_id),
      transcription_model = coalesce(${settings.transcription_model ?? null}, transcription_model),
      analysis_enabled = coalesce(${settings.analysis_enabled ?? null}, analysis_enabled),
      analysis_model_id = coalesce(${settings.analysis_model_id ?? null}, analysis_model_id),
      booking_enabled = coalesce(${settings.booking_enabled ?? null}, booking_enabled),
      active_booking_admin_id = coalesce(${settings.active_booking_admin_id ?? null}, active_booking_admin_id),
      default_timezone = coalesce(${settings.default_timezone ?? null}, default_timezone),
      require_booking_confirmation = coalesce(${settings.require_booking_confirmation ?? null}, require_booking_confirmation),
      default_booking_window_days = coalesce(${settings.default_booking_window_days ?? null}, default_booking_window_days),
      knowledge_version = knowledge_version + 1,
      updated_at = now()
    where id = 1
  `;

  invalidateSettingsCache();
  return NextResponse.json({ ok: true });
}
