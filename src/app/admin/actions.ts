"use server";

import { redirect } from "next/navigation";
import { clearAdminCookie, requireAdmin, setAdminCookie, validateAdminCredentials } from "@/lib/admin-auth";
import { getSql } from "@/lib/db";
import { invalidateSettingsCache } from "@/lib/settings-cache";

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(formData: FormData, key: string, fallback: number) {
  const value = Number(text(formData, key));
  return Number.isFinite(value) ? value : fallback;
}

export async function loginAction(formData: FormData) {
  const username = text(formData, "username");
  const password = text(formData, "password");

  if (!validateAdminCredentials(username, password)) {
    redirect("/admin/login?error=1");
  }

  await setAdminCookie(username);
  redirect("/admin");
}

export async function logoutAction() {
  await clearAdminCookie();
  redirect("/admin/login");
}

export async function saveSettingsAction(formData: FormData) {
  await requireAdmin();
  const sql = getSql();
  const agentEnabled = formData.get("agent_enabled") === "on";
  const greeting = text(formData, "greeting");
  const voice = text(formData, "voice");
  const languageMode = text(formData, "language_mode");
  const knowledgeMd = text(formData, "knowledge_md");
  const maxCallSeconds = Math.max(60, numberValue(formData, "max_call_seconds", 600));
  const dailySessionCap = Math.max(1, numberValue(formData, "daily_session_cap", 100));
  const modelId = text(formData, "model_id");
  const transcriptionModel = text(formData, "transcription_model");

  if (!voice || !languageMode || !modelId || !transcriptionModel) {
    throw new Error("Voice, language mode, model ID, and transcription model are required.");
  }

  await sql`
    update settings set
      agent_enabled = ${agentEnabled},
      greeting = ${greeting},
      voice = ${voice},
      language_mode = ${languageMode},
      knowledge_md = ${knowledgeMd},
      knowledge_version = knowledge_version + 1,
      max_call_seconds = ${maxCallSeconds},
      daily_session_cap = ${dailySessionCap},
      model_id = ${modelId},
      transcription_model = ${transcriptionModel},
      updated_at = now()
    where id = 1
  `;

  invalidateSettingsCache();
  redirect("/admin/settings?saved=1");
}

export async function cycleLeadStatusAction(formData: FormData) {
  await requireAdmin();
  const id = text(formData, "id");
  const current = text(formData, "status");
  const next = current === "new" ? "contacted" : current === "contacted" ? "closed" : "new";
  const sql = getSql();

  await sql`update leads set status = ${next} where id = ${id}`;
  redirect("/admin/leads");
}
