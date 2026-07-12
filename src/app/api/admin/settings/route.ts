import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  await requireAdmin();
  const sql = getSql();
  const rows = (await sql`select * from settings where id = 1 limit 1`) as Record<string, unknown>[];
  return NextResponse.json(rows[0] || null);
}

export async function PATCH(request: Request) {
  await requireAdmin();
  const body = (await request.json()) as Record<string, unknown>;
  const sql = getSql();

  await sql`
    update settings set
      agent_enabled = coalesce(${typeof body.agent_enabled === "boolean" ? body.agent_enabled : null}, agent_enabled),
      greeting = coalesce(${typeof body.greeting === "string" ? body.greeting : null}, greeting),
      voice = coalesce(${typeof body.voice === "string" ? body.voice : null}, voice),
      language_mode = coalesce(${typeof body.language_mode === "string" ? body.language_mode : null}, language_mode),
      knowledge_md = coalesce(${typeof body.knowledge_md === "string" ? body.knowledge_md : null}, knowledge_md),
      max_call_seconds = coalesce(${typeof body.max_call_seconds === "number" ? body.max_call_seconds : null}, max_call_seconds),
      daily_session_cap = coalesce(${typeof body.daily_session_cap === "number" ? body.daily_session_cap : null}, daily_session_cap),
      model_id = coalesce(${typeof body.model_id === "string" ? body.model_id : null}, model_id),
      transcription_model = coalesce(${typeof body.transcription_model === "string" ? body.transcription_model : null}, transcription_model),
      knowledge_version = knowledge_version + 1,
      updated_at = now()
    where id = 1
  `;

  invalidateSettingsCache();
  return NextResponse.json({ ok: true });
}
